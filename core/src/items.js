// Storing and fetching the bytes of an item: its thumbnail, preview and
// original ("tiers"). Each tier is one encrypted blob on its owner's
// Hypercore, and the group log points to it.

import Hyperblobs from 'hyperblobs'
import b4a from 'b4a'
import { CIPHER_CHUNK, decryptChunk, encryptBlob, hex, newBlobKey, sha256, unhex, unwrapKey, wrapKey } from './crypto.js'

/** @typedef {import('./group.js').Tier} Tier */

/**
 * Encrypts the bytes with a fresh key and stores them as one blob.
 * @param {any} core this member's blob Hypercore
 * @param {Uint8Array} plain
 * @param {Uint8Array} epochKey
 * @returns {Promise<Tier>}
 */
export async function storeTier(core, plain, epochKey) {
  const blobs = new Hyperblobs(core, { blockSize: CIPHER_CHUNK })
  await blobs.ready()
  const key = newBlobKey()

  const ws = blobs.createWriteStream()
  for (const chunk of encryptBlob(plain, key)) ws.write(chunk)
  ws.end()
  await new Promise((resolve, reject) => {
    ws.once('close', resolve)
    ws.once('error', reject)
  })
  return { blob: ws.id, size: plain.byteLength, sha256: sha256(plain), ...wrapKey(key, epochKey) }
}

/**
 * Downloads one tier from whoever in the swarm has its blocks, decrypts it
 * and checks it against the size and hash in the group log.
 * @param {any} store a Corestore
 * @param {string} owner hex key of the Hypercore that holds the blob
 * @param {Tier} tier
 * @param {Uint8Array} epochKey
 * @returns {Promise<Uint8Array>}
 */
export async function fetchTier(store, owner, tier, epochKey) {
  const key = unwrapKey(tier, epochKey)
  const blobs = new Hyperblobs(store.get({ key: unhex(owner) }), { blockSize: CIPHER_CHUNK })
  await blobs.ready()

  let received = 0
  let index = 0
  let pending = b4a.alloc(0)
  /** @type {Uint8Array[]} */
  const plain = []
  /** @param {boolean} flush */
  const decryptReady = (flush) => {
    while (pending.byteLength >= CIPHER_CHUNK || (flush && pending.byteLength > 0)) {
      const chunk = pending.subarray(0, CIPHER_CHUNK)
      pending = pending.subarray(chunk.byteLength)
      const isLast = received === tier.blob.byteLength && pending.byteLength === 0
      plain.push(decryptChunk(chunk, key, index++, isLast))
    }
  }
  for await (const data of blobs.createReadStream(tier.blob)) {
    received += data.byteLength
    pending = pending.byteLength ? b4a.concat([pending, data]) : data
    decryptReady(false)
  }
  decryptReady(true)

  const bytes = b4a.concat(plain)
  if (bytes.byteLength !== tier.size || sha256(bytes) !== tier.sha256) {
    throw new Error('Item failed its integrity check')
  }
  return bytes
}

/** A new item id. @param {Uint8Array} random 16 random bytes */
export const itemId = (random) => hex(random)
