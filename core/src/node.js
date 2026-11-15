// One device's RANDOZ node: its DHT connection, its identities and the groups
// it is in. Each group is a session (session.js). The screen talks to this
// through `createNode`.
//
// It takes `fs` and `path` from the caller, so the same code runs on Node
// (tests, tools) and on Bare (the phone's worklet).

import DHT from 'hyperdht'
import b4a from 'b4a'
import { hex, randomBytes, sha256 } from './crypto.js'
import { MAX_ABOUT, MAX_ICON, MAX_NAME } from './group.js'
import { decodeInvite } from './invite.js'
import { createSession } from './session.js'

/**
 * @typedef {import('./session.js').TierName} TierName
 * @typedef {Awaited<ReturnType<typeof createSession>>} Session
 * @typedef {{ storage: string, fs: any, path: any, bootstrap?: { host: string, port: number }[],
 *   onEvent: (event: { type: 'state', state: any } | { type: 'log', text: string }) => void }} NodeOptions
 */

/** @param {NodeOptions} options */
export async function createNode({ storage, fs, path, bootstrap, onEvent }) {
  const savedFile = path.join(storage, 'node.json')
  const groupsDir = path.join(storage, 'groups')
  const identitiesDir = path.join(storage, 'identities')

  /** @type {any} */ let dht = null
  /** @type {Map<string, Session>} */
  const sessions = new Map()
  // The ways this device's owner can appear in a group. A group uses one of
  // them, or none: then it gives a random nickname. `icon` is the name of a
  // file in identitiesDir, or empty.
  /** @type {{ id: string, name: string, about: string, icon: string }[]} */
  let identities = []
  /** @type {string | null} the identity chosen last, offered first next time */
  let lastIdentity = null
  // How the app behaves on this device. Nothing here is told to anyone.
  //   shareReminder  ask "everyone will see them" before each share
  //   stayConnected  keep the connection while the app is off the screen
  //   view, sort, sortReverse, groupBy  how a group's photos are laid out
  //   groupHeader    how much the top of a group's screen shows
  //   viewerInfo     how much the photo viewer says about a photo
  //   panelWidth     the group list's width on a wide screen
  //   theme          light, dark, or whatever the phone is set to
  let settings = {
    shareReminder: true, stayConnected: true, view: 'large', sort: 'date', sortReverse: false,
    groupBy: 'none', viewerInfo: 'full', groupHeader: 'full', panelWidth: 360, theme: 'system'
  }
  /** @type {Record<string, string[]>} the values a setting may take, where it is one of a few */
  const CHOICES = {
    view: ['large', 'small', 'details'],
    sort: ['date', 'title', 'person', 'size'],
    groupBy: ['none', 'person', 'tag'],
    viewerInfo: ['full', 'line', 'hidden'],
    groupHeader: ['full', 'line'],
    theme: ['system', 'light', 'dark']
  }
  /** @type {string[]} group ids in the order the user arranged them; others come first, newest first */
  let order = []
  /** @type {ReturnType<typeof setTimeout> | null} */ let stateTimer = null
  let closed = false
  let suspended = false

  const log = (/** @type {string} */ text) => onEvent({ type: 'log', text })

  function readSaved() {
    try {
      return JSON.parse(fs.readFileSync(savedFile, 'utf8'))
    } catch {
      return {}
    }
  }

  const writeSaved = () => fs.writeFileSync(savedFile, JSON.stringify({ identities, lastIdentity, settings, order }))

  /** The settings in `given` that exist and hold a value they may. @param {any} given */
  function validSettings(given) {
    /** @type {Record<string, any>} */
    const out = {}
    const defaults = /** @type {Record<string, any>} */ (settings)
    for (const [key, value] of Object.entries(given || {})) {
      if (!(key in defaults) || typeof value !== typeof defaults[key]) continue
      if (CHOICES[key] && !CHOICES[key].includes(value)) continue
      if (key === 'panelWidth' && !(value >= 200 && value <= 2000)) continue
      out[key] = value
    }
    return out
  }

  /** @param {string | null | undefined} id */
  const knownIdentity = (id) => (id && identities.some((one) => one.id === id) ? id : null)

  /** What a session tells its group. @param {string | null} id */
  function identityFor(id) {
    const one = identities.find((candidate) => candidate.id === id)
    if (!one) return { name: '', about: '', icon: '' }
    let icon = ''
    try {
      if (one.icon) icon = b4a.toString(fs.readFileSync(path.join(identitiesDir, one.icon)), 'base64')
    } catch {}
    return { name: one.name, about: one.about, icon }
  }

  const isOnline = () => !suspended && !closed && !!dht && dht.online && dht.bootstrapped

  /** @param {string | null} id */
  function remember(id) {
    lastIdentity = id
    writeSaved()
  }

  /** @param {string} id */
  async function openSession(id) {
    const session = await createSession({
      id,
      dir: path.join(groupsDir, id),
      fs,
      path,
      dht,
      log: (text) => log(`[${id.slice(0, 4)}] ${text}`),
      onChange: emitState,
      isOnline,
      identityFor
    })
    sessions.set(id, session)
    return session
  }

  async function newSession() {
    const id = hex(randomBytes(8))
    fs.mkdirSync(path.join(groupsDir, id), { recursive: true })
    return openSession(id)
  }

  /** @param {string} id */
  function need(id) {
    const session = sessions.get(id)
    if (!session) throw new Error('No such group')
    return session
  }

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

  // Joining a group this device is already in ends up with two sessions for
  // it. Keep the one that was there first.
  async function dropDuplicates() {
    /** @type {Set<string>} */
    const seen = new Set()
    for (const session of [...sessions.values()]) {
      const key = session.groupKey()
      if (!key) continue
      if (!seen.has(key)) {
        seen.add(key)
        continue
      }
      sessions.delete(session.id)
      await session.discard()
      log('already in that group')
    }
  }

  async function snapshot() {
    await dropDuplicates()
    const groups = await Promise.all([...sessions.values()].map((session) => session.snapshot()))
    // The user's own order; a group not yet placed (just started or joined)
    // goes above them, newest first.
    const place = (/** @type {{ id: string }} */ group) => order.indexOf(group.id)
    groups.sort((a, b) => {
      const pa = place(a)
      const pb = place(b)
      if (pa === -1 && pb === -1) return b.joinedAt - a.joinedAt
      if (pa === -1 || pb === -1) return pa === -1 ? -1 : 1
      return pa - pb
    })
    return {
      online: isOnline(),
      identities: identities.map((one) => ({
        id: one.id, name: one.name, about: one.about, icon: one.icon ? path.join(identitiesDir, one.icon) : null
      })),
      lastIdentity: knownIdentity(lastIdentity),
      settings: { ...settings },
      groups
    }
  }

  const api = {
    /**
     * @param {{ name: string, identity?: string | null }} params `identity` is how you appear in it
     * @returns {Promise<{ group: string }>}
     */
    async createGroup({ name, identity }) {
      const session = await newSession()
      await session.setIdentity(knownIdentity(identity))
      remember(knownIdentity(identity))
      await session.create(String(name).trim().slice(0, 60))
      emitState()
      return { group: session.id }
    },

    /**
     * Starts joining with a scanned or pasted invite.
     * @param {{ code: string, identity?: string | null }} params @returns {Promise<{ group: string }>}
     */
    async joinGroup({ code, identity }) {
      const invite = decodeInvite(code)
      if (!invite) throw new Error('Not a RANDOZ invite')
      const session = await newSession()
      await session.setIdentity(knownIdentity(identity))
      remember(knownIdentity(identity))
      await session.join(invite)
      emitState()
      return { group: session.id }
    },

    /** @param {{ group: string, kind: 'open' }} params */
    createInvite: ({ group, kind }) => need(group).createInvite(kind),

    /** @param {{ group: string, id: string }} params */
    revokeInvite: ({ group, id }) => need(group).revokeInvite(id),

    /** @param {{ group: string } & Parameters<Session['shareItem']>[0]} params */
    shareItem: ({ group, ...item }) => need(group).shareItem(item),

    /** @param {{ group: string, ids: string[] }} params */
    unshareItems: ({ group, ids }) => need(group).unshareItems(ids),

    /**
     * Titles, describes and tags a photo: for the group if it is yours, else for you alone.
     * @param {{ group: string, id: string, title?: string, description?: string, tags?: string[] }} params
     */
    async setItemDetails({ group, id, ...details }) {
      await need(group).setItemDetails(id, details)
    },

    /**
     * Names and describes a group: for everyone if you created it, else for you alone.
     * @param {{ group: string, name?: string, description?: string }} params
     */
    async setGroupDetails({ group, ...details }) {
      await need(group).setGroupDetails(details)
    },

    /**
     * Blocks or unblocks a member of a group, on this device alone.
     * @param {{ group: string, member: string, blocked: boolean }} params
     */
    async setBlocked({ group, member, blocked }) {
      await need(group).setBlocked(member, blocked)
    },

    /** The order of the group list, as the user arranged it. @param {{ ids: string[] }} params */
    async setGroupOrder({ ids }) {
      order = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && sessions.has(id))
      writeSaved()
      emitState()
    },

    /** @param {{ group: string, id: string, tier: TierName }} params */
    getTier: ({ group, id, tier }) => need(group).getTier(id, tier),

    /** @param {{ group: string, ids: string[] }} params */
    async markSaved({ group, ids }) {
      need(group).markSaved(ids)
    },

    /**
     * Leaves a group, or stops trying to join one, and deletes everything
     * about it from this device.
     * @param {{ group: string }} params
     */
    async leaveGroup({ group }) {
      const session = need(group)
      sessions.delete(group)
      order = order.filter((id) => id !== group)
      writeSaved()
      await session.leave()
      emitState()
    },

    /**
     * Changes how the app behaves on this device. Nothing here is told to
     * anyone else.
     * @param {Partial<typeof settings>} params any of the settings; unknown ones are ignored
     */
    async setSettings(params) {
      settings = { ...settings, ...validSettings(params) }
      writeSaved()
      emitState()
    },

    /**
     * Makes an identity, or changes one (pass its id). `icon` is the path of
     * a small JPEG to use as its picture, null to remove the picture, or left
     * out to keep it. Groups that use the identity are told.
     * @param {{ id?: string, name: string, about?: string, icon?: string | null }} params
     * @returns {Promise<{ id: string }>}
     */
    async saveIdentity({ id, name, about, icon }) {
      const cleanName = String(name).trim().slice(0, MAX_NAME)
      if (!cleanName) throw new Error('An identity needs a name')
      const existing = identities.find((one) => one.id === id)
      const next = existing || { id: hex(randomBytes(8)), name: '', about: '', icon: '' }
      next.name = cleanName
      next.about = String(about || '').trim().slice(0, MAX_ABOUT)
      if (icon !== undefined) {
        const old = next.icon
        next.icon = ''
        if (icon) {
          const bytes = fs.readFileSync(icon)
          if (b4a.toString(bytes, 'base64').length > MAX_ICON) throw new Error('That picture is too large')
          // Named for its content, so a changed picture is a new file to the screen.
          next.icon = next.id + '-' + sha256(bytes).slice(0, 12) + '.jpg'
          fs.writeFileSync(path.join(identitiesDir, next.icon), bytes)
        }
        if (old && old !== next.icon) fs.rmSync(path.join(identitiesDir, old), { force: true })
      }
      if (!existing) identities.push(next)
      writeSaved()
      const using = [...sessions.values()].filter((session) => session.identity() === next.id)
      await Promise.all(using.map((session) => session.identityChanged()))
      emitState()
      return { id: next.id }
    },

    /**
     * Deletes an identity. Groups that used it go back to their random nickname.
     * @param {{ id: string }} params
     */
    async deleteIdentity({ id }) {
      const gone = identities.find((one) => one.id === id)
      if (!gone) return
      identities = identities.filter((one) => one.id !== id)
      if (gone.icon) fs.rmSync(path.join(identitiesDir, gone.icon), { force: true })
      if (lastIdentity === id) lastIdentity = null
      writeSaved()
      const using = [...sessions.values()].filter((session) => session.identity() === id)
      await Promise.all(using.map((session) => session.setIdentity(null)))
      emitState()
    },

    /**
     * Appear in one group as another identity, or as its random nickname (null).
     * @param {{ group: string, identity: string | null }} params
     */
    async setGroupIdentity({ group, identity }) {
      await need(group).setIdentity(knownIdentity(identity))
      remember(knownIdentity(identity))
      emitState()
    },

    /**
     * The app is going to the background: the phone is about to freeze us.
     * Close connections cleanly now, so the others notice at once instead of
     * waiting for a timeout.
     */
    async suspend() {
      if (suspended) return
      suspended = true
      await Promise.all([...sessions.values()].map((session) => session.suspend()))
      await dht.suspend()
    },

    /** The app is back: reopen everything and look for the groups straight away. */
    async resume() {
      if (!suspended) return
      await dht.resume()
      await Promise.all([...sessions.values()].map((session) => session.resume()))
      suspended = false
      emitState()
    },

    snapshot,

    async close() {
      // A suspended DHT never finishes closing, so wake it first.
      if (suspended) await api.resume()
      closed = true
      if (stateTimer) clearTimeout(stateTimer)
      await Promise.all([...sessions.values()].map((session) => session.close()))
      sessions.clear()
      await dht.destroy()
    }
  }

  fs.mkdirSync(groupsDir, { recursive: true })
  fs.mkdirSync(identitiesDir, { recursive: true })
  // Before groups had a folder each, the one group lived here. Clear it away.
  for (const old of ['cores', 'cache']) fs.rmSync(path.join(storage, old), { recursive: true, force: true })
  const saved = readSaved()
  identities = Array.isArray(saved.identities) ? saved.identities : []
  lastIdentity = saved.lastIdentity || null
  settings = { ...settings, ...validSettings(saved.settings) }
  order = Array.isArray(saved.order) ? saved.order : []
  // Before identities there was one name, used in every group. It becomes an
  // identity, and the groups already joined keep using it.
  const oldName = saved.profile && typeof saved.profile.name === 'string' ? saved.profile.name.trim() : ''
  const migrated = oldName && identities.length === 0 ? { id: hex(randomBytes(8)), name: oldName, about: '', icon: '' } : null
  if (migrated) identities.push(migrated)
  dht = new DHT({ bootstrap })
  // "Connected" on the screen follows the DHT: it has found the network, and
  // has not since lost it.
  dht.on('ready', emitState)
  dht.on('network-update', emitState)
  // If a group cannot be opened, say so and stop. Starting without it would
  // show an empty list, which looks like the groups are gone.
  try {
    for (const id of fs.readdirSync(groupsDir)) {
      const session = await openSession(id)
      if (migrated) await session.setIdentity(migrated.id)
    }
    if (migrated) remember(migrated.id)
  } catch (err) {
    await Promise.all([...sessions.values()].map((session) => session.close().catch(() => {})))
    await dht.destroy()
    throw err
  }
  emitState()
  return api
}
