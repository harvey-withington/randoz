// The group log: who is in the group, what they shared, which invites exist.
//
// It is an Autobase. Each member appends entries to their own Hypercore and
// Autobase merges them into one agreed order. `apply` turns that order into
// the "view", a Hyperbee (sorted key/value store):
//
//   group              -> { name, createdAt, createdBy }
//   member/<writer>    -> { addedBy, addedAt, left }
//   item/<id>          -> the item entry, plus sharedBy
//   invite/<id>        -> { kind, key, createdBy, createdAt, revoked }
//
// Autobase applies whatever a writer appends, so every rule about who may do
// what lives in `apply`. It can be re-run when the order changes, so it must
// only read and write the view, and must not use clocks or random numbers.

import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import { derive, hex, unhex } from './crypto.js'

/**
 * @typedef {{ blob: { byteOffset: number, blockOffset: number, blockLength: number, byteLength: number },
 *   size: number, sha256: string, nonce: string, wrappedKey: string }} Tier
 * @typedef {{ v: 1, id: string, type: 'photo' | 'video' | 'file', name: string, mime: string,
 *   width: number, height: number, createdAt: number, owner: string, epoch: number,
 *   tiers: { original: Tier, preview?: Tier, thumbnail?: Tier } }} ItemEntry
 * @typedef {ItemEntry & { sharedBy: string }} Item
 * @typedef {{ key: string, addedBy: string, addedAt: number, left: boolean }} Member
 * @typedef {{ id: string, kind: 'open', key: string, createdBy: string, createdAt: number, revoked: boolean }} InviteRecord
 * @typedef {{ name: string, createdAt: number, createdBy: string }} GroupInfo
 */

/**
 * Opens a group's log. Pass `key` to open an existing group, or null to
 * create one.
 * @param {any} store a Corestore
 * @param {Uint8Array | null} key
 * @param {Uint8Array} secret the group secret
 */
export async function openGroup(store, key, secret) {
  /** @type {any} */
  const base = new Autobase(store.namespace('group'), key, {
    valueEncoding: 'json',
    encryptionKey: derive(secret, 'log'),
    ackInterval: 1000,
    open: (/** @type {any} */ viewStore) =>
      new Hyperbee(viewStore.get('view'), { extension: false, keyEncoding: 'utf-8', valueEncoding: 'json' }),
    apply: (/** @type {any[]} */ nodes, /** @type {any} */ view, /** @type {any} */ host) =>
      apply(nodes, view, host, () => hex(base.key))
  })
  await base.ready()
  return base
}

/**
 * @param {any[]} nodes @param {any} view @param {any} host
 * @param {() => string} creator the key of the writer who created the group
 */
async function apply(nodes, view, host, creator) {
  for (const node of nodes) {
    const entry = node.value
    if (!entry || typeof entry.type !== 'string') continue
    const from = hex(node.from.key) // set by Autobase, cannot be faked
    const sender = from === creator() ? { left: false } : (await view.get('member/' + from))?.value
    const isMember = !!sender && !sender.left

    if (entry.type === 'group') {
      // Only the creator names the group, and only once.
      if (from !== creator() || (await view.get('group'))) continue
      await view.put('group', { name: String(entry.name), createdAt: entry.at, createdBy: from })
      await view.put('member/' + from, { addedBy: from, addedAt: entry.at, left: false })
    } else if (entry.type === 'add-writer') {
      if (!isMember || (await view.get('member/' + entry.key))) continue
      // Members can write but do not vote on the order (indexer: false).
      await host.addWriter(unhex(entry.key), { indexer: false })
      await view.put('member/' + entry.key, { addedBy: from, addedAt: entry.at, left: false })
    } else if (entry.type === 'item') {
      const item = entry.item
      if (!isMember || !item || typeof item.id !== 'string' || (await view.get('item/' + item.id))) continue
      await view.put('item/' + item.id, { ...item, sharedBy: from })
    } else if (entry.type === 'unshare') {
      const existing = await view.get('item/' + entry.id)
      if (existing && existing.value.sharedBy === from) await view.del('item/' + entry.id)
    } else if (entry.type === 'leave') {
      if (!isMember) continue
      // Leaving takes your items out of everyone's gallery.
      for await (const { key, value } of view.createReadStream({ gte: 'item/', lt: 'item0' })) {
        if (value.sharedBy === from) await view.del(key)
      }
      await view.put('member/' + from, { ...sender, left: true })
    } else if (entry.type === 'invite') {
      if (!isMember || (await view.get('invite/' + entry.id))) continue
      await view.put('invite/' + entry.id, {
        kind: entry.kind, key: entry.key, createdBy: from, createdAt: entry.at, revoked: false
      })
    } else if (entry.type === 'invite-revoke') {
      const invite = await view.get('invite/' + entry.id)
      const allowed = invite && (invite.value.createdBy === from || from === creator())
      if (allowed && isMember) await view.put('invite/' + entry.id, { ...invite.value, revoked: true })
    }
  }
}

/** @param {any} base @param {string} prefix @returns {Promise<{ key: string, value: any }[]>} */
async function list(base, prefix) {
  const out = []
  const range = { gte: prefix + '/', lt: prefix + '0' }
  for await (const { key, value } of base.view.createReadStream(range)) {
    out.push({ key: key.slice(prefix.length + 1), value })
  }
  return out
}

/** @param {any} base @returns {Promise<GroupInfo | null>} */
export const getGroupInfo = async (base) => (await base.view.get('group'))?.value ?? null

/** @param {any} base @returns {Promise<Member[]>} */
export const listMembers = async (base) => (await list(base, 'member')).map(({ key, value }) => ({ key, ...value }))

/** @param {any} base @returns {Promise<Item[]>} oldest first */
export const listItems = async (base) =>
  (await list(base, 'item')).map(({ value }) => value).sort((a, b) => a.createdAt - b.createdAt)

/** @param {any} base @returns {Promise<InviteRecord[]>} */
export const listInvites = async (base) => (await list(base, 'invite')).map(({ key, value }) => ({ id: key, ...value }))

/** @param {any} base @param {string} id @returns {Promise<Item | null>} */
export const getItem = async (base, id) => (await base.view.get('item/' + id))?.value ?? null
