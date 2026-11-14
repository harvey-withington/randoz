// Two or three nodes on a private DHT, exercising groups end to end.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
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
  const start = async (name) => {
    const node = await createNode({ storage: path.join(root, name), fs, path, bootstrap: testnet.bootstrap, onEvent() {} })
    nodes.push(node)
    return node
  }
  /** @param {string} name @param {number} size */
  const file = (name, size) => {
    const p = path.join(root, name)
    fs.writeFileSync(p, randomBytes(size))
    return p
  }
  /** One group as a node sees it. @param {any} node @param {string} id */
  const view = async (node, id) => (await node.snapshot()).groups.find((/** @type {any} */ g) => g.id === id)
  /** A photo with the sizes given. @param {string} name @param {number} original @param {number} [thumbnail] */
  const photo = (name, original, thumbnail) => ({
    type: 'photo', name, mime: 'image/jpeg', width: 10, height: 10,
    files: { original: file(name, original), ...(thumbnail ? { thumbnail: file('t-' + name, thumbnail) } : {}) }
  })
  /** Alice starts a group and Bob joins it. Returns each one's id for the group. */
  const pair = async (name = 'Whale tour') => {
    const alice = await start('alice')
    const bob = await start('bob')
    const { group: a } = await alice.createGroup({ name })
    const { code } = await alice.createInvite({ group: a, kind: 'open' })
    const { group: b } = await bob.joinGroup({ code })
    await until(async () => (await view(bob, b)).writable === true, 'bob to become a writer')
    return { alice, bob, a, b, code }
  }
  return { start, file, root, view, photo, pair, nodes, bootstrap: testnet.bootstrap }
}

test('a newcomer joins by invite, and photos travel both ways', async (t) => {
  const { view, photo, pair, start } = await setup(t)
  const alice = await start('alice')
  const bob = await start('bob')
  const { group: a } = await alice.createGroup({ name: 'Whale tour' })
  const { code } = await alice.createInvite({ group: a, kind: 'open' })

  const { group: b } = await bob.joinGroup({ code })
  assert.equal((await view(bob, b)).joining, true)
  await until(async () => (await view(bob, b)).writable === true, 'bob to become a writer')
  void pair

  const bobView = await view(bob, b)
  assert.equal(bobView.name, 'Whale tour')
  assert.equal(bobView.members.length, 2)
  assert.equal(bobView.members.filter((/** @type {any} */ m) => m.me).length, 1)

  const shared = photo('whale.jpg', 300000, 9000)
  const { id } = await alice.shareItem({ group: a, ...shared })

  // The thumbnail arrives by itself; the original only when asked for.
  await until(async () => !!(await view(bob, b)).items[0]?.files.thumbnail, 'the thumbnail to reach bob')
  const seen = (await view(bob, b)).items[0]
  assert.equal(seen.id, id)
  assert.equal(seen.mine, false)
  assert.equal(seen.saved, false)
  assert.equal(seen.files.original, null)
  assert.match(seen.by.name, / /)
  assert.deepEqual(fs.readFileSync(seen.files.thumbnail), fs.readFileSync(shared.files.thumbnail))

  const fetched = await bob.getTier({ group: b, id, tier: 'original' })
  assert.deepEqual(fs.readFileSync(fetched.path), fs.readFileSync(shared.files.original))

  await bob.markSaved({ group: b, ids: [id] })
  assert.equal((await view(bob, b)).items[0].saved, true)

  const back = await bob.shareItem({ group: b, ...photo('seal.jpg', 120000, 5000) })
  await until(
    async () => !!(await view(alice, a)).items.find((/** @type {any} */ i) => i.id === back.id)?.files.thumbnail,
    'bob\'s thumbnail to reach alice'
  )
})

test('members see who is online, and the identity each chose for the group', async (t) => {
  const { view, pair, file } = await setup(t)
  const { alice, bob, a, b } = await pair()

  await until(async () => (await view(alice, a)).members.every((/** @type {any} */ m) => m.online), 'alice to see bob online')
  await until(async () => (await view(bob, b)).members.every((/** @type {any} */ m) => m.online), 'bob to see alice online')

  // Bob makes an identity with a picture and uses it here.
  const picture = file('bob.jpg', 4000)
  const { id: builder } = await bob.saveIdentity({ name: '  Bob the Builder  ', about: 'Can we fix it?', icon: picture })
  assert.equal((await bob.snapshot()).identities[0].name, 'Bob the Builder')
  assert.equal((await view(bob, b)).identity, null) // not used anywhere until chosen
  await bob.setGroupIdentity({ group: b, identity: builder })
  await until(
    async () => (await view(alice, a)).members.some((/** @type {any} */ m) => m.name === 'Bob the Builder' && !m.me),
    'bob\'s name to reach alice'
  )
  const bobAsAlice = (await view(alice, a)).members.find((/** @type {any} */ m) => !m.me)
  assert.match(bobAsAlice.nickname, / /) // the nickname is still there underneath
  assert.equal(bobAsAlice.about, 'Can we fix it?')
  assert.deepEqual(fs.readFileSync(bobAsAlice.icon), fs.readFileSync(picture))

  // Editing the identity reaches the groups that use it.
  await bob.saveIdentity({ id: builder, name: 'Bob', about: '', icon: null })
  await until(async () => {
    const seen = (await view(alice, a)).members.find((/** @type {any} */ m) => !m.me)
    return seen.name === 'Bob' && seen.about === '' && seen.icon === null
  }, 'the edited identity to reach alice')

  // A second group can use another identity, or none.
  const { group: other } = await bob.createGroup({ name: 'Elsewhere' })
  assert.equal((await view(bob, other)).identity, null)
  assert.match((await view(bob, other)).me.name, / /)
  assert.equal((await view(bob, b)).me.name, 'Bob')

  // Deleting it goes back to the nickname.
  await bob.deleteIdentity({ id: builder })
  assert.equal((await bob.snapshot()).identities.length, 0)
  await until(
    async () => (await view(alice, a)).members.find((/** @type {any} */ m) => !m.me).name === bobAsAlice.nickname,
    'bob\'s nickname to come back'
  )

  await bob.suspend()
  await until(async () => (await view(alice, a)).members.find((/** @type {any} */ m) => !m.me).online === false, 'alice to see bob offline', 8000)
})

test('several photos can be unshared at once, and only by their owner', async (t) => {
  const { view, photo, pair } = await setup(t)
  const { alice, bob, a, b } = await pair()

  const one = await alice.shareItem({ group: a, ...photo('1.jpg', 30000) })
  const two = await alice.shareItem({ group: a, ...photo('2.jpg', 30000) })
  const three = await alice.shareItem({ group: a, ...photo('3.jpg', 30000) })
  await until(async () => (await view(bob, b)).items.length === 3, 'three items to reach bob')

  // Bob cannot unshare Alice's photos.
  await bob.unshareItems({ group: b, ids: [one.id] })
  await alice.unshareItems({ group: a, ids: [one.id, three.id] })
  await until(async () => (await view(bob, b)).items.length === 1, 'the unshare to reach bob')
  assert.equal((await view(bob, b)).items[0].id, two.id)
  assert.equal((await view(alice, a)).items.length, 1)
})

test('a device can be in several groups, each with its own identity', async (t) => {
  const { view, photo, start } = await setup(t)
  const alice = await start('alice')
  const bob = await start('bob')

  const { group: a1 } = await alice.createGroup({ name: 'First' })
  const { group: a2 } = await alice.createGroup({ name: 'Second' })
  const first = await alice.createInvite({ group: a1, kind: 'open' })
  const second = await alice.createInvite({ group: a2, kind: 'open' })

  const { group: b1 } = await bob.joinGroup({ code: first.code })
  const { group: b2 } = await bob.joinGroup({ code: second.code })
  await until(async () => (await view(bob, b1)).writable === true, 'bob to join the first group')
  await until(async () => (await view(bob, b2)).writable === true, 'bob to join the second group')

  const state = await bob.snapshot()
  assert.equal(state.groups.length, 2)
  assert.deepEqual(state.groups.map((/** @type {any} */ g) => g.name).sort(), ['First', 'Second'])
  // Nothing links Bob in one group to Bob in the other.
  assert.notEqual((await view(bob, b1)).me.key, (await view(bob, b2)).me.key)

  // A photo shared to one group stays in that group.
  await alice.shareItem({ group: a1, ...photo('only-first.jpg', 40000, 2000) })
  await until(async () => (await view(bob, b1)).items.length === 1, 'the photo to reach bob in the first group')
  assert.equal((await view(bob, b2)).items.length, 0)

  // Leaving one group leaves the other untouched.
  await bob.leaveGroup({ group: b1 })
  assert.equal((await bob.snapshot()).groups.length, 1)
  await bob.shareItem({ group: b2, ...photo('second.jpg', 40000, 2000) })
  await until(async () => (await view(alice, a2)).items.length === 1, 'bob\'s photo to reach alice in the second group')
  await until(async () => (await view(alice, a1)).members.length === 1, 'bob to be gone from the first group')
})

test('joining a group you are already in does not make a second copy', async (t) => {
  const { pair } = await setup(t)
  const { bob, code } = await pair()
  await bob.joinGroup({ code })
  await until(async () => {
    const { groups } = await bob.snapshot()
    return groups.length === 1 && !groups[0].joining
  }, 'the duplicate to be dropped')
})

test('a revoked invite no longer lets anyone in', async (t) => {
  const { start, view } = await setup(t)
  const alice = await start('alice')
  const carol = await start('carol')

  const { group: a } = await alice.createGroup({ name: 'Closed' })
  const { code } = await alice.createInvite({ group: a, kind: 'open' })
  const [invite] = (await view(alice, a)).invites
  assert.equal(invite.code, code)
  await alice.revokeInvite({ group: a, id: invite.id })
  await until(async () => (await view(alice, a)).invites.length === 0, 'the revoke to apply')

  const { group: c } = await carol.joinGroup({ code })
  await new Promise((resolve) => setTimeout(resolve, 4000))
  assert.equal((await view(carol, c)).joining, true)

  // Giving up on a join removes it.
  await carol.leaveGroup({ group: c })
  assert.equal((await carol.snapshot()).groups.length, 0)
})

test('leaving removes your photos for the others and wipes the group from this device', async (t) => {
  const { view, photo, pair, root } = await setup(t)
  const { alice, bob, a, b } = await pair('Leaving')

  await bob.shareItem({ group: b, ...photo('b.jpg', 50000) })
  await until(async () => (await view(alice, a)).items.length === 1, 'bob\'s item to reach alice')

  await bob.leaveGroup({ group: b })
  assert.equal((await bob.snapshot()).groups.length, 0)
  assert.deepEqual(fs.readdirSync(path.join(root, 'bob', 'groups')), [])
  await until(async () => (await view(alice, a)).items.length === 0, 'bob\'s item to leave alice\'s gallery')
  assert.equal((await view(alice, a)).members.length, 1)
})

test('groups, identities, settings and saved marks survive the app restarting', async (t) => {
  const { start, view, photo, nodes } = await setup(t)
  const alice = await start('alice')
  const { id: identity } = await alice.saveIdentity({ name: 'Alice' })
  assert.equal((await alice.snapshot()).settings.shareReminder, true)
  await alice.setSettings({ shareReminder: false })
  const { group } = await alice.createGroup({ name: 'Persistent', identity })
  const { id } = await alice.shareItem({ group, ...photo('a.jpg', 70000, 3000) })
  await alice.markSaved({ group, ids: [id] })
  const before = await view(alice, group)
  assert.equal(before.me.name, 'Alice')
  await alice.close()
  nodes.splice(nodes.indexOf(alice), 1)

  const again = await start('alice')
  assert.equal((await again.snapshot()).identities[0].name, 'Alice')
  assert.equal((await again.snapshot()).lastIdentity, identity)
  assert.equal((await view(again, group)).identity, identity)
  assert.equal((await view(again, group)).me.name, 'Alice')
  assert.equal((await again.snapshot()).settings.shareReminder, false)
  const after = await view(again, group)
  assert.equal(after.name, 'Persistent')
  assert.equal(after.me.key, before.me.key)
  assert.equal(after.items[0].id, id)
  assert.equal(after.items[0].saved, true)
  assert.ok(after.items[0].files.thumbnail)
})

test('a member that was suspended reconnects quickly when it resumes', async (t) => {
  const { view, photo, pair } = await setup(t)
  const { alice, bob, a, b } = await pair('Sleepy')

  await bob.suspend()
  await until(async () => (await view(alice, a)).peers === 0, 'alice to notice bob has gone', 5000)

  // What alice shares while bob is away reaches him once he is back.
  await alice.shareItem({ group: a, ...photo('a.jpg', 40000, 2000) })
  await bob.resume()
  await until(async () => (await view(bob, b)).peers === 1, 'bob to reconnect', 8000)
  await until(async () => !!(await view(bob, b)).items[0]?.files.thumbnail, 'the photo to reach bob', 8000)
})

test('a photo shared again after being unshared shows up promptly', async (t) => {
  const { view, photo, pair } = await setup(t)
  const { alice, bob, a, b } = await pair('Again')

  // Either member may be the one doing it: the creator, or someone who joined.
  for (const [sharer, sharerGroup, watcher, watcherGroup] of [[bob, b, alice, a], [alice, a, bob, b]]) {
    const first = await sharer.shareItem({ group: sharerGroup, ...photo('one.jpg', 60000, 3000) })
    await until(async () => (await view(watcher, watcherGroup)).items.length === 1, 'the first share to arrive', 5000)
    await sharer.unshareItems({ group: sharerGroup, ids: [first.id] })
    await until(async () => (await view(watcher, watcherGroup)).items.length === 0, 'the unshare to arrive', 5000)
    const second = await sharer.shareItem({ group: sharerGroup, ...photo('two.jpg', 60000, 3000) })
    await until(async () => (await view(watcher, watcherGroup)).items[0]?.id === second.id, 'the second share to arrive', 5000)
    await until(async () => !!(await view(watcher, watcherGroup)).items[0]?.files.thumbnail, 'its thumbnail to arrive', 5000)
    await sharer.unshareItems({ group: sharerGroup, ids: [second.id] })
    await until(async () => (await view(watcher, watcherGroup)).items.length === 0, 'the last unshare to arrive', 5000)
  }
})

test('a member that vanishes without a word is noticed within half a minute', async (t) => {
  const { view, start, root, bootstrap } = await setup(t)
  const alice = await start('alice')
  const { group: a } = await alice.createGroup({ name: 'Gone' })
  const { code } = await alice.createInvite({ group: a, kind: 'open' })

  // Bob runs in a process of his own, and is killed: no goodbye is sent.
  const bob = spawn(process.execPath, [
    path.join(import.meta.dirname, '..', 'tools', 'member.js'), path.join(root, 'bob'), String(bootstrap[0].port), code
  ], { stdio: 'inherit' })
  t.after(() => bob.kill('SIGKILL'))
  const online = async () => (await view(alice, a)).members.filter((/** @type {any} */ m) => m.online).length
  await until(async () => (await online()) === 2, 'bob to join')

  bob.kill('SIGKILL')
  await until(async () => (await online()) === 1 && (await view(alice, a)).peers === 0, 'alice to notice', 30000)
})

test('the one name from before identities becomes an identity its groups keep', async (t) => {
  const { start, view, nodes, root } = await setup(t)
  const alice = await start('alice')
  const { group } = await alice.createGroup({ name: 'Old times' })
  await alice.close()
  nodes.splice(nodes.indexOf(alice), 1)
  // As an older version saved it.
  fs.writeFileSync(path.join(root, 'alice', 'node.json'), JSON.stringify({ profile: { name: 'Alice' } }))

  const again = await start('alice')
  const state = await again.snapshot()
  assert.equal(state.identities.length, 1)
  assert.equal(state.identities[0].name, 'Alice')
  assert.equal((await view(again, group)).identity, state.identities[0].id)
  await until(async () => (await view(again, group)).me.name === 'Alice', 'the name to be told to the group')
})
