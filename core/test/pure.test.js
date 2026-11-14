import test from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { CIPHER_CHUNK, decryptChunk, derive, encryptBlob, newBlobKey, randomBytes, unwrapKey, wrapKey } from '../src/crypto.js'
import { checkInviteProof, createInvite, decodeInvite, encodeInvite, inviteId, inviteProof, inviteTopic } from '../src/invite.js'
import { nicknameFor } from '../src/nickname.js'

test('a blob encrypts into block-sized chunks and decrypts back', () => {
  const plain = randomBytes(200000)
  const key = newBlobKey()
  const chunks = encryptBlob(plain, key)
  assert.equal(chunks.length, 4)
  assert.equal(chunks[0].byteLength, CIPHER_CHUNK)
  const back = Buffer.concat(chunks.map((chunk, i) => decryptChunk(chunk, key, i, i === chunks.length - 1)))
  assert.deepEqual(back, Buffer.from(plain))
})

test('an empty blob still round-trips', () => {
  const key = newBlobKey()
  const chunks = encryptBlob(new Uint8Array(0), key)
  assert.equal(chunks.length, 1)
  assert.equal(decryptChunk(chunks[0], key, 0, true).byteLength, 0)
})

test('a changed, reordered or truncated chunk is rejected', () => {
  const key = newBlobKey()
  const chunks = encryptBlob(randomBytes(200000), key)
  const flipped = Buffer.from(chunks[0])
  flipped[100] ^= 1
  assert.throws(() => decryptChunk(flipped, key, 0, false))
  assert.throws(() => decryptChunk(chunks[0], key, 1, false))
  assert.throws(() => decryptChunk(chunks[0], key, 0, true))
  assert.throws(() => decryptChunk(chunks[0], newBlobKey(), 0, false))
})

test('a wrapped key opens only with the same epoch key', () => {
  const blobKey = newBlobKey()
  const epoch = randomBytes(32)
  assert.deepEqual(unwrapKey(wrapKey(blobKey, epoch), epoch), blobKey)
  assert.throws(() => unwrapKey(wrapKey(blobKey, epoch), randomBytes(32)))
})

test('derived keys differ by label and by root', () => {
  const root = randomBytes(32)
  assert.notDeepEqual(derive(root, 'topic'), derive(root, 'log'))
  assert.notDeepEqual(derive(root, 'topic'), derive(randomBytes(32), 'topic'))
  assert.deepEqual(derive(root, 'topic'), derive(root, 'topic'))
})

test('an invite survives being written as text', () => {
  const invite = createInvite('open')
  const text = encodeInvite(invite)
  assert.match(text, /^randoz:\/\/join\//)
  const back = decodeInvite('  ' + text + '\n')
  assert.ok(back)
  assert.equal(back.kind, 'open')
  assert.deepEqual(Buffer.from(back.key), Buffer.from(invite.key))
})

test('text that is not an invite is refused', () => {
  for (const text of ['', 'hello', 'https://example.com', 'randoz://join/', 'randoz://join/AAAA', 'randoz://join/!!!']) {
    assert.equal(decodeInvite(text), null, text)
  }
})

test('an invite does not reveal its key through its id or topic', () => {
  const invite = createInvite('open')
  const keyHex = Buffer.from(invite.key).toString('hex')
  assert.equal(inviteId(invite.key).length, 32)
  assert.ok(!keyHex.includes(inviteId(invite.key)))
  assert.notEqual(Buffer.from(inviteTopic(invite.key)).toString('hex'), keyHex)
})

test('an invite proof only works for the member it was made for', () => {
  const invite = createInvite('open')
  const member = randomBytes(32)
  const proof = inviteProof(invite.key, member)
  assert.ok(checkInviteProof(invite.key, member, proof))
  assert.ok(!checkInviteProof(invite.key, randomBytes(32), proof))
  assert.ok(!checkInviteProof(createInvite('open').key, member, proof))
})

test('the same-network shortcut patch is applied to hyperdht', () => {
  const file = new URL('../node_modules/hyperdht/lib/connect.js', import.meta.url)
  assert.ok(fs.readFileSync(file, 'utf8').includes('RANDOZ patch'), 'run: node patches/apply.cjs')
})

test('a nickname is stable for a key and differs between keys', () => {
  const a = Buffer.from(randomBytes(32)).toString('hex')
  assert.deepEqual(nicknameFor(a), nicknameFor(a))
  assert.match(nicknameFor(a).name, /^[A-Z][a-z]+ [A-Z][a-z]+$/)
  const hue = nicknameFor(a).hue
  assert.ok(hue >= 0 && hue < 360)
  const names = new Set()
  for (let i = 0; i < 200; i++) names.add(nicknameFor(Buffer.from(randomBytes(32)).toString('hex')).name)
  assert.ok(names.size > 100)
})
