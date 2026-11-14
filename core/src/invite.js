// Invites: how someone outside a group gets in.
//
// An invite never contains the group's secret. It contains an invite key,
// which lets its holder find a member and prove they hold the invite; the
// member then sends the secret over the encrypted connection. Because the
// two are separate, an invite can be revoked and the group stays private.
//
// Kinds:
//   open       safe to post in a chat or on social media. Works until it is
//              revoked or the group ends.
//   in-person  (planned) changes every minute and is shown on a member's
//              screen, so only someone present can use it.

import b4a from 'b4a'
import { derive, hex, randomBytes, equal } from './crypto.js'

export const INVITE_KINDS = /** @type {const} */ (['open'])
const KIND_BYTE = { open: 1 }
const VERSION = 1
const PREFIX = 'randoz://join/'

/**
 * @typedef {{ kind: 'open', key: Uint8Array }} Invite
 */

/** @param {'open'} kind @returns {Invite} */
export function createInvite(kind) {
  if (!INVITE_KINDS.includes(kind)) throw new Error('Unknown invite kind: ' + kind)
  return { kind, key: randomBytes(32) }
}

/** The text a QR code or link carries. @param {Invite} invite */
export function encodeInvite(invite) {
  const bytes = b4a.alloc(34)
  bytes[0] = VERSION
  bytes[1] = KIND_BYTE[invite.kind]
  bytes.set(invite.key, 2)
  return PREFIX + b4a.toString(bytes, 'base64url')
}

/**
 * Reads an invite from scanned or pasted text. Returns null if it isn't one.
 * @param {string} text @returns {Invite | null}
 */
export function decodeInvite(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith(PREFIX)) return null
  let bytes
  try {
    bytes = b4a.from(trimmed.slice(PREFIX.length), 'base64url')
  } catch {
    return null
  }
  if (bytes.byteLength !== 34 || bytes[0] !== VERSION || bytes[1] !== KIND_BYTE.open) return null
  return { kind: 'open', key: bytes.subarray(2) }
}

/** What the group log records about an invite. @param {Uint8Array} key */
export const inviteId = (key) => hex(derive(key, 'invite/id').subarray(0, 16))

/** Where members listen for people holding this invite. @param {Uint8Array} key */
export const inviteTopic = (key) => derive(key, 'invite/topic')

/**
 * Proof that the sender holds the invite, tied to the member it is talking
 * to, so a recorded proof cannot be replayed to someone else.
 * @param {Uint8Array} key @param {Uint8Array} memberPublicKey
 */
export const inviteProof = (key, memberPublicKey) => derive(key, 'invite/proof/' + hex(memberPublicKey))

/** @param {Uint8Array} key @param {Uint8Array} memberPublicKey @param {Uint8Array} proof */
export const checkInviteProof = (key, memberPublicKey, proof) => equal(inviteProof(key, memberPublicKey), proof)
