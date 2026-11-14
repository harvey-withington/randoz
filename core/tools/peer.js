// A RANDOZ member on the desktop, for testing against phones.
//
//   node tools/peer.js --name a --create "Whale tour"     start a group, print its invite
//   node tools/peer.js --name b --join "randoz://join/…"  join with an invite
//   node tools/peer.js --name a                           carry on in the groups it is in
//
// Add --share photo.jpg to share a file once in the group, and --as "Harv" to
// set the name others see. It keeps running, printing what happens and
// saving every photo that arrives to tools-data/<name>/received/. Ctrl+C
// stops it; --reset starts from nothing.

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

/** @type {Map<string, string>} group id -> last line printed about it */
const summaries = new Map()
/** @type {Set<string>} */
const saved = new Set()
let shared = false

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
  for (const group of state.groups) {
    const line = group.joining
      ? (group.joinError ? 'invite refused: ' + group.joinError : 'looking for the group…')
      : `"${group.name}": I am ${group.me.name}, ${group.members.length} member(s) ` +
        `(${group.members.filter((/** @type {any} */ m) => m.online).length} online), ` +
        `${group.items.length} photo(s)` + (group.writable ? '' : ' (still joining)')
    if (summaries.get(group.id) !== line) {
      summaries.set(group.id, line)
      say(line)
    }
    if (group.joining) continue

    if (opts.share && group.writable && !shared) {
      shared = true
      const { id } = await node.shareItem({
        group: group.id, type: 'photo', name: path.basename(opts.share), mime: 'image/jpeg', width: 0, height: 0,
        files: { original: opts.share }
      })
      say(`shared ${opts.share} as ${id.slice(0, 8)}`)
    }

    for (const item of group.items) {
      if (item.mine || saved.has(item.id)) continue
      saved.add(item.id)
      const t0 = Date.now()
      const { path: file } = await node.getTier({ group: group.id, id: item.id, tier: 'original' })
      const out = path.join(received, `${item.id.slice(0, 8)}-${item.name}`)
      fs.copyFileSync(file, out)
      say(`received "${item.name}" from ${item.by?.name} in ${Date.now() - t0} ms -> ${out}`)
    }
  }
}

// --as "Harv" appears under that name in a group made or joined in this run.
/** @type {string | null} */
let identity = null
if (opts.as) {
  const known = (await node.snapshot()).identities.find((/** @type {any} */ one) => one.name === opts.as)
  identity = known ? known.id : (await node.saveIdentity({ name: opts.as })).id
}
const first = await node.snapshot()
if (opts.create && first.groups.length === 0) {
  const { group } = await node.createGroup({ name: opts.create, identity })
  say('making an invite…')
  const { code } = await node.createInvite({ group, kind: 'open' })
  say('invite: ' + code)
} else if (opts.join && first.groups.length === 0) {
  await node.joinGroup({ code: opts.join, identity })
} else {
  for (const group of first.groups) {
    for (const invite of group.invites || []) say(`invite for "${group.name}": ${invite.code}`)
  }
}
await onState(await node.snapshot())

process.once('SIGINT', async () => {
  await node.close()
  process.exit(0)
})
