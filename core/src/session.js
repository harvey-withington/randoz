// One group on this device, or one attempt to join one.
//
// A session has its own folder, its own Corestore and its own Hyperswarm with
// its own key pair, so nothing links what this device does in one group to
// what it does in another, and leaving a group deletes one folder. All
// sessions share the node's DHT.

import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Protomux from 'protomux'
import c from 'compact-encoding'
import b4a from 'b4a'
import { derive, equal, hex, randomBytes, sha256, unhex } from './crypto.js'
import { getGroupInfo, getItem, listInvites, listItems, listMembers, openGroup } from './group.js'
import { checkInviteProof, createInvite, decodeInvite, encodeInvite, inviteId, inviteProof, inviteTopic } from './invite.js'
import { fetchTier, itemId, storeTier } from './items.js'
import { nicknameFor } from './nickname.js'
import { capPacketSize } from './transport.js'

/**
 * @typedef {'thumbnail' | 'preview' | 'original'} TierName
 * @typedef {{ id: string, dir: string, fs: any, path: any, dht: any,
 *   log: (text: string) => void, onChange: () => void, isOnline: () => boolean,
 *   identityFor: (id: string | null) => Appearance }} SessionOptions
 * @typedef {{ name: string, about: string, icon: string }} Appearance how a member appears: icon is base64 JPEG, or empty
 */

const TIERS = /** @type {TierName[]} */ (['thumbnail', 'preview', 'original'])
const EAGER_FETCHES = 4
const LOOKUP_EVERY_MS = 3000
const ANNOUNCE_WAIT_MS = 15000
const LONELY_CHECK_MS = 15000
const MISSING_CHECK_EVERY = 4 // in lonely checks: once a minute
const QUIET_MS = 15000

/**
 * Hyperswarm destroys, suspends and resumes the DHT it is given. Sessions
 * share one DHT that the node looks after, so each gets this stand-in, on
 * which those three do nothing.
 * @param {any} dht
 */
function sharedDht(dht) {
  const nothing = async () => {}
  return new Proxy(dht, {
    get(target, prop) {
      if (prop === 'destroy' || prop === 'suspend' || prop === 'resume') return nothing
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

/** @param {SessionOptions} options */
export async function createSession({ id, dir, fs, path, dht, log, onChange, isOnline, identityFor }) {
  const savedFile = path.join(dir, 'session.json')
  const cacheDir = path.join(dir, 'cache')

  /** @type {any} */ let store = null
  /** @type {any} */ let swarm = null
  /** @type {any} */ let base = null
  /** @type {Uint8Array | null} */ let secret = null
  /** @type {import('./invite.js').Invite | null} */ let pendingInvite = null
  let joinError = ''
  let joinedAt = 0
  /** @type {string | null} which of this device's identities is used here; null is the random one */
  let identityId = null
  /** @type {Map<string, string>} a member's picture (base64) -> its file in the cache */
  const iconFiles = new Map()
  /** @type {Map<string, any>} topic (hex) -> discovery session */
  const topics = new Map()
  /** @type {Set<string>} cache file names on disk */
  let cached = new Set()
  /** @type {Set<string>} ids of items saved to the camera roll */
  let savedItems = new Set()
  /** @type {Map<string, Promise<string>>} */
  const fetching = new Map()
  /** @type {Map<any, string>} connection -> the member (writer key) on the other end */
  const online = new Map()
  /** @type {ReturnType<typeof setInterval> | null} */ let lookupTimer = null
  /** @type {ReturnType<typeof setInterval> | null} */ let lonelyTimer = null
  let suspended = false
  let namePending = false
  let checks = 0

  const short = (/** @type {string} */ key) => key.slice(0, 8)
  const epochKey = () => derive(/** @type {Uint8Array} */ (secret), 'epoch/0')

  // --- Saved state ----------------------------------------------------------

  function readSaved() {
    try {
      return JSON.parse(fs.readFileSync(savedFile, 'utf8'))
    } catch {
      return {}
    }
  }

  function writeSaved() {
    fs.writeFileSync(savedFile, JSON.stringify({
      secret: secret ? hex(secret) : undefined,
      logKey: base ? hex(base.key) : undefined,
      invite: pendingInvite ? encodeInvite(pendingInvite) : undefined,
      joinedAt,
      identity: identityId,
      saved: [...savedItems]
    }))
  }

  // --- Opening and closing ---------------------------------------------------

  async function open() {
    fs.mkdirSync(cacheDir, { recursive: true })
    cached = new Set(fs.readdirSync(cacheDir))
    store = new Corestore(path.join(dir, 'cores'))
    await store.ready()
    swarm = new Hyperswarm({ dht: sharedDht(dht), keyPair: await store.createKeyPair('swarm') })
    swarm.on('connection', onConnection)
    let seen = ''
    swarm.on('update', () => {
      if (!swarm) return
      const now = `found ${swarm.peers.size}, trying ${swarm.connecting}, connected ${swarm.connections.size}`
      if (now !== seen) log((seen = now))
    })
    lonelyTimer = setInterval(() => lookAgainIfLonely().catch(() => {}), LONELY_CHECK_MS)

    const saved = readSaved()
    savedItems = new Set(saved.saved || [])
    joinedAt = saved.joinedAt || Date.now()
    identityId = saved.identity || null
    if (saved.logKey && saved.secret) await enterGroup(unhex(saved.logKey), unhex(saved.secret))
    else if (saved.invite) pendingInvite = decodeInvite(saved.invite)
    await syncTopics()
  }

  async function close() {
    if (lookupTimer) clearInterval(lookupTimer)
    if (lonelyTimer) clearInterval(lonelyTimer)
    lookupTimer = lonelyTimer = null
    topics.clear()
    fetching.clear()
    online.clear()
    if (swarm) await swarm.destroy()
    if (base) await base.close()
    if (store) await store.close()
    swarm = base = store = secret = null
  }

  /** @param {Uint8Array | null} logKey @param {Uint8Array} groupSecret */
  async function enterGroup(logKey, groupSecret) {
    secret = groupSecret
    pendingInvite = null
    base = await openGroup(store, logKey, groupSecret)
    base.on('update', onUpdate)
    base.on('writable', onUpdate)
    // Our own blobs must be reachable from the start, not only after we next share.
    await store.get({ name: 'blobs' }).ready()
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
  // retries by itself, but backs off for minutes after a few failures. With
  // some connected and others missing, it looks once a minute.
  async function lookAgainIfLonely() {
    if (suspended || !base) return
    if (swarm.connections.size > 0) {
      if (++checks % MISSING_CHECK_EVERY !== 0) return
      const others = (await listMembers(base)).filter((m) => !m.left).length - 1
      if (suspended || !base || new Set(online.values()).size >= others) return
      log('someone is missing: looking again')
    }
    for (const discovery of topics.values()) discovery.refresh().catch(() => {})
  }

  /** Resolves once the DHT knows we listen on this topic, or after a while anyway. */
  async function announced(/** @type {Uint8Array} */ topic) {
    const discovery = topics.get(hex(topic))
    if (!discovery) return
    await Promise.race([discovery.flushed(), new Promise((resolve) => setTimeout(resolve, ANNOUNCE_WAIT_MS))])
  }

  // --- Connections and the handshake -----------------------------------------
  //
  //   newcomer -> member : { type: 'request', inviteId, proof }
  //   member -> newcomer : { type: 'welcome', logKey, secret }
  //   member -> member   : { type: 'hello', key, proof }
  //
  // `hello` says which member is on the other end, proved with the group's
  // secret. It is how the group knows who is online, and it is how a newcomer
  // gets added as a writer: a member who hears hello from someone the log
  // doesn't know yet adds them. It is sent on every connection, so a lost
  // message heals itself.

  /** @param {any} conn @param {any} info */
  function onConnection(conn, info) {
    conn.on('error', () => {}) // a peer going away is not a crash
    conn.on('close', () => {
      online.delete(conn)
      log(`connection to ${short(hex(info.publicKey))} closed`)
      onChange()
    })
    // The other end sends something every few seconds even when idle. One
    // that goes quiet has gone away without saying so (a frozen app, a lost
    // network): drop it, so that a fresh connection can take its place.
    conn.setTimeout(QUIET_MS)
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
    onChange()
  }

  /** @param {any} conn @param {(msg: object) => void} send */
  function greet(conn, send) {
    if (base && secret) return sendHello(conn, send)
    if (pendingInvite) {
      const proof = inviteProof(pendingInvite.key, conn.remotePublicKey)
      send({ type: 'request', inviteId: inviteId(pendingInvite.key), proof: hex(proof) })
    }
  }

  /** @param {any} conn @param {(msg: object) => void} send */
  function sendHello(conn, send) {
    const proof = derive(/** @type {Uint8Array} */ (secret), 'member/proof/' + hex(conn.remotePublicKey))
    send({ type: 'hello', key: hex(base.local.key), proof: hex(proof) })
  }

  /** @param {any} conn @param {any} msg @param {(msg: object) => void} send */
  async function onMessage(conn, msg, send) {
    if (msg.type === 'request' && base && secret) {
      const invite = (await listInvites(base)).find((i) => i.id === msg.inviteId)
      if (!invite || invite.revoked) return send({ type: 'refused', reason: 'invite-not-valid' })
      if (!checkInviteProof(unhex(invite.key), conn.publicKey, unhex(msg.proof))) return
      send({ type: 'welcome', logKey: hex(base.key), secret: hex(secret) })
    } else if (msg.type === 'welcome' && !base && pendingInvite) {
      await enterGroup(unhex(msg.logKey), unhex(msg.secret))
      log(`joined group ${short(msg.logKey)}`)
      sendHello(conn, send)
      onChange()
    } else if (msg.type === 'refused' && !base && pendingInvite) {
      joinError = msg.reason
      onChange()
    } else if (msg.type === 'hello' && base && secret) {
      const expected = derive(secret, 'member/proof/' + hex(conn.publicKey))
      if (!equal(expected, unhex(msg.proof))) return
      // Answer the first hello on a connection with our own: the other side
      // may have just joined, and missed the one we sent when it connected.
      const first = !online.has(conn)
      online.set(conn, msg.key)
      if (first) log(`${short(msg.key)} is here`)
      if (first) sendHello(conn, send)
      onChange()
      if (base.writable && !(await base.view.get('member/' + msg.key))) {
        await base.append({ type: 'add-writer', key: msg.key, at: Date.now() })
        log(`added ${short(msg.key)} to the group`)
      }
    }
  }

  // --- Items -------------------------------------------------------------------

  /** @param {string} itemKey @param {TierName} tier */
  const cacheName = (itemKey, tier) => `${itemKey}.${tier}`
  /** @param {string} name */
  const cachePath = (name) => path.join(cacheDir, name)

  /**
   * Makes sure one tier of an item is on disk, and returns its path.
   * @param {string} itemKey @param {TierName} tier @returns {Promise<string>}
   */
  function ensureTier(itemKey, tier) {
    const name = cacheName(itemKey, tier)
    if (cached.has(name)) return Promise.resolve(cachePath(name))
    const existing = fetching.get(name)
    if (existing) return existing

    const started = Date.now()
    const job = (async () => {
      const item = await getItem(base, itemKey)
      const entry = item && item.tiers[tier]
      if (!item || !entry) throw new Error('No such item or tier')
      const bytes = await fetchTier(store, item.owner, entry, epochKey())
      fs.writeFileSync(cachePath(name), bytes)
      cached.add(name)
      log(`got ${tier} of ${short(itemKey)} in ${Date.now() - started} ms`)
      return cachePath(name)
    })()
    fetching.set(name, job)
    job.catch(() => {}).finally(() => {
      fetching.delete(name)
      onChange()
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

  // Tells the group how we appear here whenever that differs from what the log has.
  async function syncProfile() {
    if (!base || !base.writable || namePending) return
    const mine = (await base.view.get('member/' + hex(base.local.key)))?.value
    const want = identityFor(identityId)
    if (!mine) return
    if ((mine.name || '') === want.name && (mine.about || '') === want.about && (mine.icon || '') === want.icon) return
    namePending = true
    try {
      await base.append({ type: 'profile', name: want.name, about: want.about, icon: want.icon })
    } finally {
      namePending = false
    }
  }

  /**
   * A member's picture as a file the screen can show, written on first sight.
   * @param {string} memberKey @param {string | undefined} icon base64 JPEG
   */
  function iconPath(memberKey, icon) {
    if (!icon) return null
    const known = iconFiles.get(icon)
    if (known) return known
    const name = 'icon-' + memberKey.slice(0, 16) + '-' + sha256(b4a.from(icon)).slice(0, 12) + '.jpg'
    if (!cached.has(name)) {
      fs.writeFileSync(cachePath(name), b4a.from(icon, 'base64'))
      cached.add(name)
    }
    iconFiles.set(icon, cachePath(name))
    return cachePath(name)
  }

  function onUpdate() {
    log(`group log updated (${base.view.version} entries in view)`)
    syncTopics().catch((err) => log('topics failed: ' + err.message))
    syncProfile().catch((err) => log('profile failed: ' + err.message))
    onChange()
  }

  // --- What the screen sees ----------------------------------------------------

  async function snapshot() {
    const peers = swarm ? swarm.connections.size : 0
    if (!base) {
      return { id, joining: true, joinError, peers, joinedAt, identity: identityId, name: '', writable: false }
    }
    const info = await getGroupInfo(base)
    const myKey = hex(base.local.key)
    const here = new Set(online.values())
    const members = (await listMembers(base)).filter((m) => !m.left).map((m) => {
      const nick = nicknameFor(m.key)
      return {
        key: m.key, name: m.name || nick.name, nickname: nick.name, hue: nick.hue,
        about: m.about || '', icon: iconPath(m.key, m.icon),
        me: m.key === myKey, online: m.key === myKey ? isOnline() : here.has(m.key)
      }
    })
    const byKey = new Map(members.map((m) => [m.key, m]))
    const items = (await listItems(base)).map((item) => {
      const by = byKey.get(item.sharedBy)
      /** @type {Record<string, string | null>} */
      const files = {}
      for (const tier of TIERS) {
        const name = cacheName(item.id, tier)
        files[tier] = cached.has(name) ? cachePath(name) : null
      }
      return {
        id: item.id, type: item.type, name: item.name, mime: item.mime,
        width: item.width, height: item.height, createdAt: item.createdAt,
        size: item.tiers.original.size, sharedBy: item.sharedBy,
        by: by ? { name: by.name, hue: by.hue, icon: by.icon, online: by.online } : null,
        mine: item.sharedBy === myKey, saved: savedItems.has(item.id), files
      }
    })
    const invites = (await listInvites(base)).filter((i) => !i.revoked).map((i) => ({
      id: i.id, kind: i.kind, createdAt: i.createdAt, mine: i.createdBy === myKey,
      code: encodeInvite({ kind: i.kind, key: unhex(i.key) })
    }))
    fetchThumbnails().catch(() => {})
    return {
      id, key: hex(base.key), name: info ? info.name : '', createdAt: info ? info.createdAt : 0,
      joinedAt, identity: identityId, writable: base.writable, joining: false, joinError: '', peers,
      me: byKey.get(myKey) || {
        key: myKey, ...nicknameFor(myKey), nickname: nicknameFor(myKey).name, about: '', icon: null, me: true, online: isOnline()
      },
      members, items, invites
    }
  }

  // --- What the node can ask for -----------------------------------------------

  const requireGroup = () => {
    if (!base || !secret) throw new Error('Still joining this group')
  }
  const requireWriter = () => {
    requireGroup()
    if (!base.writable) throw new Error('Still joining this group')
  }

  await open()

  return {
    id,
    /** The group's key, once known. Two sessions with the same key are the same group. */
    groupKey: () => (base ? hex(base.key) : null),

    /** @param {string} name */
    async create(name) {
      await enterGroup(null, randomBytes(32))
      await base.append({ type: 'group', name, at: Date.now() })
      await syncProfile()
    },

    /** @param {import('./invite.js').Invite} invite */
    async join(invite) {
      pendingInvite = invite
      joinError = ''
      writeSaved()
      await syncTopics()
    },

    /** @param {'open'} kind @returns {Promise<{ code: string }>} */
    async createInvite(kind) {
      requireWriter()
      const invite = createInvite(kind)
      await base.append({ type: 'invite', id: inviteId(invite.key), kind, key: hex(invite.key), at: Date.now() })
      // Hand the code out only once someone holding it can find us.
      await syncTopics()
      await announced(inviteTopic(invite.key))
      return { code: encodeInvite(invite) }
    },

    /** @param {string} inviteKey the invite's id */
    async revokeInvite(inviteKey) {
      requireWriter()
      await base.append({ type: 'invite-revoke', id: inviteKey })
    },

    /**
     * @param {{ type: 'photo', name: string, mime: string, width: number, height: number,
     *   files: Partial<Record<TierName, string>> }} params
     */
    async shareItem({ type, name, mime, width, height, files }) {
      requireWriter()
      if (!files.original) throw new Error('An item needs its original')
      const newId = itemId(randomBytes(16))
      const core = store.get({ name: 'blobs' })
      await core.ready()
      /** @type {Record<string, import('./group.js').Tier>} */
      const tiers = {}
      for (const tier of TIERS) {
        const file = files[tier]
        if (!file) continue
        const bytes = fs.readFileSync(file)
        tiers[tier] = await storeTier(core, bytes, epochKey())
        fs.writeFileSync(cachePath(cacheName(newId, tier)), bytes)
        cached.add(cacheName(newId, tier))
      }
      const item = { v: 1, id: newId, type, name, mime, width, height, createdAt: Date.now(), owner: hex(core.key), epoch: 0, tiers }
      await base.append({ type: 'item', item })
      return { id: newId }
    },

    /** @param {string[]} ids */
    async unshareItems(ids) {
      requireWriter()
      await base.append({ type: 'unshare', ids })
    },

    /** @param {string} itemKey @param {TierName} tier */
    async getTier(itemKey, tier) {
      requireGroup()
      return { path: await ensureTier(itemKey, tier) }
    },

    /** Remembers that these items were saved to the camera roll. @param {string[]} ids */
    markSaved(ids) {
      for (const one of ids) savedItems.add(one)
      writeSaved()
      onChange()
    },

    /** Which of this device's identities is used here; null is the random one. */
    identity: () => identityId,

    /** Appear in this group as another identity, or as the random one (null). @param {string | null} next */
    async setIdentity(next) {
      identityId = next
      writeSaved()
      await syncProfile()
      onChange()
    },

    /** Called when the identity used here has been edited. */
    identityChanged: () => syncProfile(),

    /** Leaves the group (or stops joining) and deletes its folder. */
    async leave() {
      if (base && base.writable) {
        await base.append({ type: 'leave', at: Date.now() })
        await new Promise((resolve) => setTimeout(resolve, 500)) // let the entry reach peers
      }
      await close()
      fs.rmSync(dir, { recursive: true, force: true })
    },

    /** Drops this session without telling the group, as when it turns out to be a duplicate. */
    async discard() {
      await close()
      fs.rmSync(dir, { recursive: true, force: true })
    },

    async suspend() {
      if (suspended || !swarm) return
      suspended = true
      log('suspending')
      await swarm.suspend()
      await store.suspend()
    },

    async resume() {
      if (!suspended || !swarm) return
      await store.resume()
      await swarm.resume()
      suspended = false
      log('resumed')
      for (const discovery of topics.values()) discovery.refresh().catch(() => {})
    },

    snapshot,
    close
  }
}
