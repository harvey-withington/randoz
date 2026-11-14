// Keys, hashes and item encryption. Pure functions: no network, no storage.

import sodium from 'sodium-universal'
import b4a from 'b4a'

const TAG = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES // 16
const NONCE = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES // 24
const KEY = sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES // 32

// One encrypted chunk is exactly one Hyperblobs block (64 KB), so a reader
// can fetch and decrypt any block alone.
export const CIPHER_CHUNK = 65536
const PLAIN_CHUNK = CIPHER_CHUNK - TAG

/** @param {Uint8Array} buf */
export const hex = (buf) => b4a.toString(buf, 'hex')
/** @param {string} str @returns {Uint8Array} */
export const unhex = (str) => b4a.from(str, 'hex')

/** @param {number} n @returns {Uint8Array} */
export function randomBytes(n) {
  const buf = b4a.alloc(n)
  sodium.randombytes_buf(buf)
  return buf
}

/**
 * A 32-byte key for one purpose, from a root key and a label. Knowing one
 * derived key (a swarm topic, say) reveals neither the root nor the others.
 * @param {Uint8Array} root @param {string} label @returns {Uint8Array}
 */
export function derive(root, label) {
  const out = b4a.alloc(32)
  sodium.crypto_generichash(out, b4a.from('randoz/1/' + label), root)
  return out
}

/** @param {Uint8Array} buf @returns {string} hex SHA-256 */
export function sha256(buf) {
  const out = b4a.alloc(32)
  sodium.crypto_hash_sha256(out, buf)
  return hex(out)
}

// The item key is random and used for one blob only, so the chunk index is a
// safe nonce. The "last chunk" flag makes a truncated blob fail to decrypt.
/** @param {number} index @param {boolean} isLast */
function chunkNonce(index, isLast) {
  const nonce = b4a.alloc(NONCE)
  nonce.writeUInt32LE(index, 0)
  nonce[8] = isLast ? 1 : 0
  return nonce
}

/**
 * @param {Uint8Array} plain
 * @param {Uint8Array} key
 * @returns {Uint8Array[]} encrypted chunks, each one Hyperblobs block
 */
export function encryptBlob(plain, key) {
  const chunks = []
  const count = Math.max(1, Math.ceil(plain.byteLength / PLAIN_CHUNK))
  for (let i = 0; i < count; i++) {
    const part = plain.subarray(i * PLAIN_CHUNK, (i + 1) * PLAIN_CHUNK)
    const out = b4a.alloc(part.byteLength + TAG)
    sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(out, part, null, null, chunkNonce(i, i === count - 1), key)
    chunks.push(out)
  }
  return chunks
}

/**
 * Throws if the chunk was altered, reordered or encrypted with another key.
 * @param {Uint8Array} cipher @param {Uint8Array} key @param {number} index @param {boolean} isLast
 */
export function decryptChunk(cipher, key, index, isLast) {
  const out = b4a.alloc(cipher.byteLength - TAG)
  sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(out, null, cipher, null, chunkNonce(index, isLast), key)
  return out
}

/** @returns {Uint8Array} a fresh key for one blob */
export const newBlobKey = () => randomBytes(KEY)

/**
 * A blob key goes into the group log wrapped with the epoch key, so whoever
 * holds the log but not the group secret cannot open items.
 * @param {Uint8Array} blobKey @param {Uint8Array} epochKey
 */
export function wrapKey(blobKey, epochKey) {
  const nonce = randomBytes(sodium.crypto_secretbox_NONCEBYTES)
  const boxed = b4a.alloc(blobKey.byteLength + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(boxed, blobKey, nonce, epochKey)
  return { nonce: hex(nonce), wrappedKey: hex(boxed) }
}

/** @param {{ nonce: string, wrappedKey: string }} wrapped @param {Uint8Array} epochKey */
export function unwrapKey(wrapped, epochKey) {
  const boxed = unhex(wrapped.wrappedKey)
  const blobKey = b4a.alloc(boxed.byteLength - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(blobKey, boxed, unhex(wrapped.nonce), epochKey)
  if (ok === false) throw new Error('Could not unwrap the item key')
  return blobKey
}

/** Constant-time comparison. @param {Uint8Array} a @param {Uint8Array} b */
export function equal(a, b) {
  return a.byteLength === b.byteLength && sodium.sodium_memcmp(a, b)
}
