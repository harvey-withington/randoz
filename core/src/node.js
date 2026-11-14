// One device's RANDOZ node: its storage, its connections and, at most, the
// one group it is in. The screen talks to this through `createNode`.
//
// It takes `fs` and `path` from the caller, so the same code runs on Node
// (tests, tools) and on Bare (the phone's worklet).

import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Protomux from 'protomux'
import c from 'compact-encoding'
import { derive, hex, randomBytes, unhex, equal } from './crypto.js'
import { getGroupInfo, getItem, listInvites, listItems, listMembers, openGroup } from './group.js'
import { checkInviteProof, createInvite, decodeInvite, encodeInvite, inviteId, inviteProof, inviteTopic } from './invite.js'
import { fetchTier, itemId, storeTier } from './items.js'
import { nicknameFor } from './nickname.js'
import { capPacketSize } from './transport.js'

/**
 * @typedef {'thumbnail' | 'preview' | 'original'} TierName
 * @typedef {{ storage: string, fs: any, path: any, bootstrap?: { host: string, port: number }[],
 *   onEvent: (event: { type: 'state', state: any } | { type: 'log', text: string }) => void }} NodeOptions
 */

const TIERS = /** @type {TierName[]} */ (['thumbnail', 'preview', 'original'])
const EAGER_FETCHES = 4
const LOOKUP_EVERY_MS = 3000
const ANNOUNCE_WAIT_MS = 15000
const LONELY_CHECK_MS = 15000

/** @param {NodeOptions} options */
export async function createNode({ storage, fs, path, bootstrap, onEvent }) {
  const stateFile = path.join(storage, 'node.json')
  const coresDir = path.join(storage, 'cores')
  const cacheDir = path.join(storage, 'cache')

  /** @type {any} */ let store = null
  /** @type {any} */ let swarm = null
  /** @type {any} */ let base = null
  /** @type {Uint8Array | null} */ let secret = null
  /** @type {import('./invite.js').Invite | null} */ let pendingInvite = null
  let joinError = ''
  /** @type {Map<string, any>} topic (hex) -> discovery session */
  const topics = new Map()
  /** @type {Set<string>} cache file names present on disk */
  let cached = new Set()
  /** @type {Map<string, Promise<string>>} cache file name -> fetch in flight */
  const fetching = new Map()
  /** @type {ReturnType<typeof setTimeout> | null} */ let stateTimer = null
  /** @type {ReturnType<typeof setInterval> | null} */ let lookupTimer = null
  /** @type {ReturnType<typeof setInterval> | null} */ let lonelyTimer = null
  let suspended = false
  let closed = false

  const log = (/** @type {string} */ text) => onEvent({ type: 'log', text })
  const short = (/** @type {string} */ key) => key.slice(0, 8)
  const epochKey = () => derive(/** @type {Uint8Array} */ (secret), 'epoch/0')

  // --- Saved state ----------------------------------------------------------

  /** @returns {{ group?: { secret: string, logKey: string } }} */
  function readSaved() {
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    } catch {
      return {}
    }
  }

  function writeSaved() {
    const saved = base && secret ? { group: { secret: hex(secret), logKey: hex(base.key) } } : {}
    fs.writeFileSync(stateFile, JSON.stringify(saved))
  }

  // --- Opening and closing ---------------------------------------------------

  async function open() {
    fs.mkdirSync(coresDir, { recursive: true })
    fs.mkdirSync(cacheDir, { recursive: true })
    cached = new Set(fs.readdirSync(cacheDir))
    store = new Corestore(coresDir)
    await store.ready()

    swarm = new Hyperswarm({ bootstrap, keyPair: await store.createKeyPair('swarm') })
    swarm.on('connection', onConnection)
    lonelyTimer = setInterval(lookAgainIfLonely, LONELY_CHECK_MS)

    const saved = readSaved().group
    if (saved) await enterGroup(unhex(saved.logKey), unhex(saved.secret))
    emitState()
  }

  async function shut() {
    if (stateTimer) clearTimeout(stateTimer)
    if (lookupTimer) clearInterval(lookupTimer)
    if (lonelyTimer) clearInterval(lonelyTimer)
    stateTimer = lookupTimer = lonelyTimer = null
    topics.clear()
    fetching.clear()
    if (swarm) await swarm.destroy()
    if (base) await base.close()
    if (store) await store.close()
    swarm = base = store = secret = null
  }

  /** @param {Uint8Array | null} logKey @param {Uint8Array} groupSecret */
  async function enterGroup(logKey, groupSecret) {
    secret = groupSecret
    base = await openGroup(store, logKey, groupSecret)
    base.on('update', onUpdate)
    base.on('writable', onUpdate)
    writeSaved()
    await syncTopics()
  }

  // --- Topics ----------------------------------------------------------------

  // Members announce on the group's topic, and on one topic per live invite so
  // that people holding an invite can find them.
  async function syncTopics() {
    /** @type {Map<string, { topic: Uint8Array, server: boolean, client: boolean }>} */
    const wanted = new Map()
    if (base && secret) {
      const topic = derive(secret, 'topic')
      wanted.set(hex(topic), { topic, server: true, client: true })
      for (const invite of await listInvites(base)) {
        if (invite.revoked) continue
        const t = inviteTopic(unhex(invite.key))
        wanted.set(hex(t), { topic: t, server: true, client: false })
      }
    } else if (pendingInvite) {
      const t = inviteTopic(pendingInvite.key)
      wanted.set(hex(t), { topic: t, server: false, client: true })
    }
    for (const [key, discovery] of topics) {
      if (wanted.has(key)) continue
      topics.delete(key)
      discovery.destroy().catch(() => {})
    }
    for (const [key, { topic, server, client }] of wanted) {
      if (!topics.has(key)) topics.set(key, swarm.join(topic, { server, client }))
    }

    // Someone joining looks for members again every few seconds: the member
    // who made the invite may not have finished announcing it yet.
    if (lookupTimer) clearInterval(lookupTimer)
    lookupTimer = null
    if (!base && pendingInvite) {
      lookupTimer = setInterval(() => {
        for (const discovery of topics.values()) discovery.refresh({ client: true, server: false }).catch(() => {})
      }, LOOKUP_EVERY_MS)
    }
  }

  // A member with nobody connected looks for the others again. Hyperswarm
  // retries by itself, but backs off for minutes after a few failures.
  function lookAgainIfLonely() {
    if (suspended || !base || swarm.connections.size > 0) return
    for (const discovery of topics.values()) discovery.refresh().catch(() => {})
  }

  /** Resolves once the DHT knows we listen on this topic, or after a while anyway. */
  async function announced(/** @type {Uint8Array} */ topic) {
    const discovery = topics.get(hex(topic))
    if (!discovery) return
    await Promise.race([discovery.flushed(), new Promise((resolve) => setTimeout(resolve, ANNOUNCE_WAIT_MS))])
  }

  // --- Connections and the invite handshake ----------------------------------
  //
  //   newcomer -> member : { type: 'request', inviteId, proof }
  //   member -> newcomer : { type: 'welcome', logKey, secret }
  //   newcomer -> member : { type: 'writer', key, proof }
  //
  // The last message is also what a member who knows the secret but is not
  // yet a writer sends on any connection, so a lost message heals itself.

  /** @param {any} conn @param {any} info */
  function onConnection(conn, info) {
    conn.on('error', () => {}) // a peer going away is not a crash
    conn.on('close', emitState)
    store.replicate(conn)
    if (!capPacketSize(conn.rawStream)) log('packet size cap not applied')
    log(`connected to ${short(hex(info.publicKey))}`)

    const channel = Protomux.from(conn).createChannel({
      protocol: 'randoz/invite/1',
      onopen: () => greet(conn, send)
    })
    const message = channel.addMessage({
      encoding: c.json,
      onmessage: (/** @type {any} */ msg) =>
        onMessage(conn, msg, send).catch((err) => log('handshake failed: ' + err.message))
    })
    const send = (/** @type {object} */ msg) => message.send(msg)
    channel.open()
    emitState()
  }

  /** @param {any} conn @param {(msg: object) => void} send */
  function greet(conn, send) {
    if (!base && pendingInvite) {
      const proof = inviteProof(pendingInvite.key, conn.remotePublicKey)
      send({ type: 'request', inviteId: inviteId(pendingInvite.key), proof: hex(proof) })
    } else if (base && secret && !base.writable) {
      sendWriterKey(conn, send)
    }
  }

  /** @param {any} conn @param {(msg: object) => void} send */
  function sendWriterKey(conn, send) {
    const proof = derive(/** @type {Uint8Array} */ (secret), 'member/proof/' + hex(conn.remotePublicKey))
    send({ type: 'writer', key: hex(base.local.key), proof: hex(proof) })
  }

  /** @param {any} conn @param {any} msg @param {(msg: object) => void} send */
  async function onMessage(conn, msg, send) {
    if (msg.type === 'request' && base && secret) {
      const invite = (await listInvites(base)).find((i) => i.id === msg.inviteId)
      if (!invite || invite.revoked) return send({ type: 'refused', reason: 'invite-not-valid' })
      if (!checkInviteProof(unhex(invite.key), conn.publicKey, unhex(msg.proof))) return
      send({ type: 'welcome', logKey: hex(base.key), secret: hex(secret) })
    } else if (msg.type === 'welcome' && !base && pendingInvite) {
      pendingInvite = null
      await enterGroup(unhex(msg.logKey), unhex(msg.secret))
      log(`joined group ${short(msg.logKey)}`)
      sendWriterKey(conn, send)
      emitState()
    } else if (msg.type === 'refused' && !base && pendingInvite) {
      joinError = msg.reason
      emitState()
    } else if (msg.type === 'writer' && base && secret && base.writable) {
      const expected = derive(secret, 'member/proof/' + hex(conn.publicKey))
      if (!equal(expected, unhex(msg.proof))) return
      if (await base.view.get('member/' + msg.key)) return
      await base.append({ type: 'add-writer', key: msg.key, at: Date.now() })
      log(`added ${short(msg.key)} to the group`)
    }
  }

  // --- Items -------------------------------------------------------------------

  /** @param {string} id @param {TierName} tier */
  const cacheName = (id, tier) => `${id}.${tier}`
  /** @param {string} name */
  const cachePath = (name) => path.join(cacheDir, name)

  /**
   * Makes sure one tier of an item is on disk, and returns its path.
   * @param {string} id @param {TierName} tier @returns {Promise<string>}
   */
  function ensureTier(id, tier) {
    const name = cacheName(id, tier)
    if (cached.has(name)) return Promise.resolve(cachePath(name))
    const existing = fetching.get(name)
    if (existing) return existing

    const job = (async () => {
      const item = await getItem(base, id)
      const entry = item && item.tiers[tier]
      if (!item || !entry) throw new Error('No such item or tier')
      const bytes = await fetchTier(store, item.owner, entry, epochKey())
      fs.writeFileSync(cachePath(name), bytes)
      cached.add(name)
      return cachePath(name)
    })()
    fetching.set(name, job)
    job.catch(() => {}).finally(() => {
      fetching.delete(name)
      emitState()
    })
    return job
  }

  // Thumbnails are fetched for every item as soon as it appears. Previews and
  // originals wait until someone asks.
  async function fetchThumbnails() {
    if (!base) return
    for (const item of await listItems(base)) {
      if (fetching.size >= EAGER_FETCHES) return
      if (item.tiers.thumbnail && !cached.has(cacheName(item.id, 'thumbnail'))) {
        ensureTier(item.id, 'thumbnail').catch((err) => log('thumbnail failed: ' + err.message))
      }
    }
  }

  function onUpdate() {
    syncTopics().catch((err) => log('topics failed: ' + err.message))
    emitState()
  }

  // --- What the screen sees ----------------------------------------------------

  function emitState() {
    if (closed || stateTimer) return
    stateTimer = setTimeout(() => {
      stateTimer = null
      snapshot().then(
        (state) => onEvent({ type: 'state', state }),
        (err) => log('state failed: ' + err.message)
      )
    }, 40)
  }

  async function snapshot() {
    const peers = swarm ? swarm.connections.size : 0
    if (!base) return { group: null, joining: !!pendingInvite, joinError, peers }

    const info = await getGroupInfo(base)
    const myKey = hex(base.local.key)
    const members = (await listMembers(base)).map((m) => ({ ...m, ...nicknameFor(m.key), me: m.key === myKey }))
    const nameOf = new Map(members.map((m) => [m.key, m]))
    const items = (await listItems(base)).map((item) => {
      const by = nameOf.get(item.sharedBy)
      /** @type {Record<string, string | null>} */
      const files = {}
      for (const tier of TIERS) {
        const name = cacheName(item.id, tier)
        files[tier] = cached.has(name) ? cachePath(name) : null
      }
      return {
        id: item.id, type: item.type, name: item.name, mime: item.mime,
        width: item.width, height: item.height, createdAt: item.createdAt,
        size: item.tiers.original.size,
        sharedBy: item.sharedBy, by: by ? { name: by.name, hue: by.hue } : null,
        mine: item.sharedBy === myKey, files
      }
    })
    const invites = (await listInvites(base))
      .filter((i) => !i.revoked)
      .map((i) => ({
        id: i.id, kind: i.kind, createdAt: i.createdAt, mine: i.createdBy === myKey,
        code: encodeInvite({ kind: i.kind, key: unhex(i.key) })
      }))
    fetchThumbnails().catch(() => {})
    return {
      group: { key: hex(base.key), name: info ? info.name : '', createdAt: info ? info.createdAt : 0, writable: base.writable },
      joining: false, joinError: '', peers,
      me: { key: myKey, ...nicknameFor(myKey) },
      members: members.filter((m) => !m.left),
      items, invites
    }
  }

  // --- What the screen can ask for ---------------------------------------------

  const requireGroup = () => {
    if (!base || !secret) throw new Error('Not in a group')
  }
  const requireWriter = () => {
    requireGroup()
    if (!base.writable) throw new Error('Still joining the group')
  }

  const api = {
    /** @param {{ name: string }} params */
    async createGroup({ name }) {
      if (base) throw new Error('Already in a group')
      await enterGroup(null, randomBytes(32))
      await base.append({ type: 'group', name, at: Date.now() })
      emitState()
    },

    /** Starts joining with a scanned or pasted invite. @param {{ code: string }} params */
    async joinGroup({ code }) {
      if (base) throw new Error('Already in a group')
      const invite = decodeInvite(code)
      if (!invite) throw new Error('Not a RANDOZ invite')
      pendingInvite = invite
      joinError = ''
      await syncTopics()
      emitState()
    },

    async cancelJoin() {
      pendingInvite = null
      joinError = ''
      await syncTopics()
      emitState()
    },

    /** @param {{ kind: 'open' }} params @returns {Promise<{ code: string }>} */
    async createInvite({ kind }) {
      requireWriter()
      const invite = createInvite(kind)
      await base.append({ type: 'invite', id: inviteId(invite.key), kind, key: hex(invite.key), at: Date.now() })
      // Hand the code out only once someone holding it can find us.
      await syncTopics()
      await announced(inviteTopic(invite.key))
      return { code: encodeInvite(invite) }
    },

    /** @param {{ id: string }} params */
    async revokeInvite({ id }) {
      requireWriter()
      await base.append({ type: 'invite-revoke', id })
    },

    /**
     * Shares one item. `files` are paths to what the screen prepared: the
     * original, and optionally a preview and a thumbnail.
     * @param {{ type: 'photo', name: string, mime: string, width: number, height: number,
     *   files: Partial<Record<TierName, string>> }} params
     */
    async shareItem({ type, name, mime, width, height, files }) {
      requireWriter()
      if (!files.original) throw new Error('An item needs its original')
      const id = itemId(randomBytes(16))
      const core = store.get({ name: 'blobs' })
      await core.ready()
      /** @type {Record<string, import('./group.js').Tier>} */
      const tiers = {}
      for (const tier of TIERS) {
        const file = files[tier]
        if (!file) continue
        const bytes = fs.readFileSync(file)
        tiers[tier] = await storeTier(core, bytes, epochKey())
        fs.writeFileSync(cachePath(cacheName(id, tier)), bytes)
        cached.add(cacheName(id, tier))
      }
      const item = { v: 1, id, type, name, mime, width, height, createdAt: Date.now(), owner: hex(core.key), epoch: 0, tiers }
      await base.append({ type: 'item', item })
      return { id }
    },

    /** @param {{ id: string }} params */
    async unshareItem({ id }) {
      requireWriter()
      await base.append({ type: 'unshare', id })
    },

    /** @param {{ id: string, tier: TierName }} params @returns {Promise<{ path: string }>} */
    async getTier({ id, tier }) {
      requireGroup()
      return { path: await ensureTier(id, tier) }
    },

    /** Leaves the group and deletes everything about it from this device. */
    async leaveGroup() {
      requireGroup()
      if (base.writable) await base.append({ type: 'leave', at: Date.now() })
      await new Promise((resolve) => setTimeout(resolve, 500)) // let the entry reach peers
      await shut()
      fs.rmSync(storage, { recursive: true, force: true })
      await open()
    },

    /**
     * The app is going to the background: the phone is about to freeze us.
     * Close connections cleanly now, so the others notice at once instead of
     * waiting for a timeout.
     */
    async suspend() {
      if (suspended || !swarm) return
      suspended = true
      await swarm.suspend()
      await store.suspend()
    },

    /** The app is back: reopen everything and look for the group straight away. */
    async resume() {
      if (!suspended || !swarm) return
      await store.resume()
      await swarm.resume()
      suspended = false
      for (const discovery of topics.values()) discovery.refresh().catch(() => {})
      emitState()
    },

    snapshot,

    async close() {
      closed = true
      await shut()
    }
  }

  fs.mkdirSync(storage, { recursive: true })
  await open()
  return api
}
