// One device's RANDOZ node: its DHT connection, its profile and the groups it
// is in. Each group is a session (session.js). The screen talks to this
// through `createNode`.
//
// It takes `fs` and `path` from the caller, so the same code runs on Node
// (tests, tools) and on Bare (the phone's worklet).

import DHT from 'hyperdht'
import { hex, randomBytes } from './crypto.js'
import { decodeInvite } from './invite.js'
import { createSession, MAX_NAME } from './session.js'

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

  /** @type {any} */ let dht = null
  /** @type {Map<string, Session>} */
  const sessions = new Map()
  let profile = { name: '' }
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

  const writeSaved = () => fs.writeFileSync(savedFile, JSON.stringify({ profile }))

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
      profileName: () => profile.name
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
    // Newest first: the group you just started or joined is at the top.
    groups.sort((a, b) => b.joinedAt - a.joinedAt)
    return { profile: { ...profile }, groups }
  }

  const api = {
    /** @param {{ name: string }} params @returns {Promise<{ group: string }>} */
    async createGroup({ name }) {
      const session = await newSession()
      await session.create(String(name).trim().slice(0, 60))
      emitState()
      return { group: session.id }
    },

    /**
     * Starts joining with a scanned or pasted invite.
     * @param {{ code: string }} params @returns {Promise<{ group: string }>}
     */
    async joinGroup({ code }) {
      const invite = decodeInvite(code)
      if (!invite) throw new Error('Not a RANDOZ invite')
      const session = await newSession()
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
      await session.leave()
      emitState()
    },

    /**
     * Sets the name other members see, in every group. Empty goes back to
     * the random nickname each group gives you.
     * @param {{ name: string }} params
     */
    async setProfile({ name }) {
      profile = { name: String(name).trim().slice(0, MAX_NAME) }
      writeSaved()
      await Promise.all([...sessions.values()].map((session) => session.nameChanged()))
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
      closed = true
      if (stateTimer) clearTimeout(stateTimer)
      await Promise.all([...sessions.values()].map((session) => session.close()))
      sessions.clear()
      await dht.destroy()
    }
  }

  fs.mkdirSync(groupsDir, { recursive: true })
  // Before groups had a folder each, the one group lived here. Clear it away.
  for (const old of ['cores', 'cache']) fs.rmSync(path.join(storage, old), { recursive: true, force: true })
  profile = { name: '', ...readSaved().profile }
  dht = new DHT({ bootstrap })
  // If a group cannot be opened, say so and stop. Starting without it would
  // show an empty list, which looks like the groups are gone.
  try {
    for (const id of fs.readdirSync(groupsDir)) await openSession(id)
  } catch (err) {
    await Promise.all([...sessions.values()].map((session) => session.close().catch(() => {})))
    await dht.destroy()
    throw err
  }
  emitState()
  return api
}
