// Two or three nodes on a private DHT, exercising a group end to end.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import createTestnet from 'hyperdht/testnet.js'
import { createNode } from '../src/index.js'
import { randomBytes } from '../src/crypto.js'

/** @param {() => boolean | Promise<boolean>} condition @param {string} what */
async function until(condition, what, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('Timed out waiting for ' + what)
}

/** @param {import('node:test').TestContext} t */
async function setup(t) {
  const testnet = await createTestnet(4)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'randoz-core-'))
  /** @type {any[]} */
  const nodes = []
  t.after(async () => {
    for (const node of nodes) await node.close()
    await testnet.destroy()
    fs.rmSync(root, { recursive: true, force: true })
  })
  /** @param {string} name */
  const start = async (name, bootstrap = testnet.bootstrap) => {
    const node = await createNode({ storage: path.join(root, name), fs, path, bootstrap, onEvent() {} })
    nodes.push(node)
    return node
  }
  /** @param {string} name @param {number} size */
  const file = (name, size) => {
    const p = path.join(root, name)
    fs.writeFileSync(p, randomBytes(size))
    return p
  }
  return { start, file, root }
}

test('a newcomer joins by invite, and photos travel both ways', async (t) => {
  const { start, file } = await setup(t)
  const alice = await start('alice')
  const bob = await start('bob')

  await alice.createGroup({ name: 'Whale tour' })
  const { code } = await alice.createInvite({ kind: 'open' })

  await bob.joinGroup({ code })
  assert.equal((await bob.snapshot()).joining, true)
  await until(async () => (await bob.snapshot()).group?.writable === true, 'bob to become a writer')

  const bobView = await bob.snapshot()
  assert.equal(bobView.group.name, 'Whale tour')
  assert.equal(bobView.members.length, 2)
  assert.equal(bobView.members.filter((/** @type {any} */ m) => m.me).length, 1)

  const original = file('a-original.jpg', 300000)
  const thumbnail = file('a-thumb.jpg', 9000)
  const { id } = await alice.shareItem({
    type: 'photo', name: 'whale.jpg', mime: 'image/jpeg', width: 4000, height: 3000,
    files: { original, thumbnail }
  })

  // The thumbnail arrives by itself; the original only when asked for.
  await until(async () => !!(await bob.snapshot()).items[0]?.files.thumbnail, 'the thumbnail to reach bob')
  const seen = (await bob.snapshot()).items[0]
  assert.equal(seen.id, id)
  assert.equal(seen.mine, false)
  assert.equal(seen.files.original, null)
  assert.match(seen.by.name, / /)
  assert.deepEqual(fs.readFileSync(seen.files.thumbnail), fs.readFileSync(thumbnail))

  const fetched = await bob.getTier({ id, tier: 'original' })
  assert.deepEqual(fs.readFileSync(fetched.path), fs.readFileSync(original))

  const back = await bob.shareItem({
    type: 'photo', name: 'seal.jpg', mime: 'image/jpeg', width: 800, height: 600,
    files: { original: file('b-original.jpg', 120000), thumbnail: file('b-thumb.jpg', 5000) }
  })
  await until(async () => (await alice.snapshot()).items.length === 2, 'bob\'s item to reach alice')
  await until(
    async () => !!(await alice.snapshot()).items.find((/** @type {any} */ i) => i.id === back.id)?.files.thumbnail,
    'bob\'s thumbnail to reach alice'
  )

  // Unsharing takes the item out of the other member's gallery.
  await alice.unshareItem({ id })
  await until(async () => (await bob.snapshot()).items.length === 1, 'the unshare to reach bob')
})

test('a revoked invite no longer lets anyone in', async (t) => {
  const { start } = await setup(t)
  const alice = await start('alice')
  const carol = await start('carol')

  await alice.createGroup({ name: 'Closed' })
  const { code } = await alice.createInvite({ kind: 'open' })
  const [invite] = (await alice.snapshot()).invites
  assert.equal(invite.code, code)
  await alice.revokeInvite({ id: invite.id })
  await until(async () => (await alice.snapshot()).invites.length === 0, 'the revoke to apply')

  await carol.joinGroup({ code })
  await new Promise((resolve) => setTimeout(resolve, 4000))
  const state = await carol.snapshot()
  assert.equal(state.group, null)
  assert.equal(state.joining, true)
})

test('leaving removes your photos for the others and wipes this device', async (t) => {
  const { start, file, root } = await setup(t)
  const alice = await start('alice')
  const bob = await start('bob')

  await alice.createGroup({ name: 'Leaving' })
  const { code } = await alice.createInvite({ kind: 'open' })
  await bob.joinGroup({ code })
  await until(async () => (await bob.snapshot()).group?.writable === true, 'bob to become a writer')

  await bob.shareItem({
    type: 'photo', name: 'b.jpg', mime: 'image/jpeg', width: 10, height: 10,
    files: { original: file('b.jpg', 50000) }
  })
  await until(async () => (await alice.snapshot()).items.length === 1, 'bob\'s item to reach alice')

  await bob.leaveGroup()
  assert.equal((await bob.snapshot()).group, null)
  assert.deepEqual(fs.readdirSync(path.join(root, 'bob', 'cache')), [])
  await until(async () => (await alice.snapshot()).items.length === 0, 'bob\'s item to leave alice\'s gallery')
  assert.equal((await alice.snapshot()).members.length, 1)
})

test('a group survives the app restarting', async (t) => {
  const { start, file } = await setup(t)
  const alice = await start('alice')
  await alice.createGroup({ name: 'Persistent' })
  const { id } = await alice.shareItem({
    type: 'photo', name: 'a.jpg', mime: 'image/jpeg', width: 10, height: 10,
    files: { original: file('a.jpg', 70000), thumbnail: file('a-t.jpg', 3000) }
  })
  const before = await alice.snapshot()
  await alice.close()

  const again = await start('alice')
  const after = await again.snapshot()
  assert.equal(after.group.name, 'Persistent')
  assert.equal(after.me.key, before.me.key)
  assert.equal(after.items[0].id, id)
  assert.ok(after.items[0].files.thumbnail)
})
