// A RANDOZ member on the desktop, for testing against phones.
//
//   node tools/peer.js --name a --create "Whale tour"     start a group, print its invite
//   node tools/peer.js --name b --join "randoz://join/…"  join with an invite
//   node tools/peer.js --name a                           carry on in the group it is in
//
// Add --share photo.jpg to share a file once in the group. It keeps running,
// printing what happens and saving every photo that arrives to
// tools-data/<name>/received/. Ctrl+C stops it; --reset starts from nothing.

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createNode } from '../src/index.js'

/** @type {Record<string, string>} */
const opts = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const name = argv[i].replace(/^--/, '')
  opts[name] = name === 'reset' ? 'yes' : argv[++i]
}

const home = path.join('tools-data', opts.name || 'a')
const received = path.join(home, 'received')
if (opts.reset) fs.rmSync(home, { recursive: true, force: true })
fs.mkdirSync(received, { recursive: true })

const stamp = () => new Date().toISOString().slice(11, 19)
const say = (/** @type {string} */ text) => console.log(`[${stamp()}] ${text}`)

let summary = ''
/** @type {Set<string>} */
const saved = new Set()
let shared = false

/** @type {Awaited<ReturnType<typeof createNode>>} */
const node = await createNode({
  storage: path.join(home, 'node'),
  fs,
  path,
  onEvent(event) {
    if (event.type === 'log') say(event.text)
    else onState(event.state).catch((err) => say('error: ' + err.message))
  }
})

/** @param {any} state */
async function onState(state) {
  if (!state.group) {
    if (state.joining) say(state.joinError ? 'invite refused: ' + state.joinError : 'looking for the group…')
    return
  }
  const line =
    `"${state.group.name}": I am ${state.me.name}, ${state.members.length} member(s), ` +
    `${state.items.length} photo(s), ${state.peers} connected` + (state.group.writable ? '' : ' (still joining)')
  if (line !== summary) say((summary = line))

  if (opts.share && state.group.writable && !shared) {
    shared = true
    const { id } = await node.shareItem({
      type: 'photo', name: path.basename(opts.share), mime: 'image/jpeg', width: 0, height: 0,
      files: { original: opts.share }
    })
    say(`shared ${opts.share} as ${id.slice(0, 8)}`)
  }

  for (const item of state.items) {
    if (item.mine || saved.has(item.id)) continue
    saved.add(item.id)
    const t0 = Date.now()
    const { path: file } = await node.getTier({ id: item.id, tier: 'original' })
    const out = path.join(received, `${item.id.slice(0, 8)}-${item.name}`)
    fs.copyFileSync(file, out)
    say(`received "${item.name}" from ${item.by?.name} in ${Date.now() - t0} ms -> ${out}`)
  }
}

const first = await node.snapshot()
if (opts.create && !first.group) {
  await node.createGroup({ name: opts.create })
  say('making an invite…')
  const { code } = await node.createInvite({ kind: 'open' })
  say('invite: ' + code)
} else if (opts.join && !first.group) {
  await node.joinGroup({ code: opts.join })
} else if (first.group) {
  for (const invite of first.invites) say('invite: ' + invite.code)
}
await onState(await node.snapshot())

process.once('SIGINT', async () => {
  await node.close()
  process.exit(0)
})
