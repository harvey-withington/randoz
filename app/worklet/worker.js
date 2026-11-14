// The peer-to-peer core on the phone. This file runs in a Bare worklet (a
// second JavaScript engine inside the app), not in React Native. It talks to
// the screen over one stream, one JSON message per line:
//
//   screen -> worklet   { id, method, params }
//   worklet -> screen   { id, result } or { id, error }
//                       { event: 'state', state } or { event: 'log', text }
//
// `init` must come first, with the folder to keep everything in. The other
// methods are the core node's own (core/src/node.js).

const fs = require('bare-fs')
const path = require('bare-path')
const b4a = require('b4a')
const { createNode } = require('../../core/src/index.js')

const NEWLINE = String.fromCharCode(10)
// Core methods the screen may not call: the worklet runs these itself.
const HIDDEN = ['close', 'suspend', 'resume']

module.exports = function start(ipc) {
  let node = null

  const send = (msg) => ipc.write(b4a.from(JSON.stringify(msg) + NEWLINE))

  async function handle({ method, params }) {
    if (method === 'init') {
      if (!node) {
        node = await createNode({
          storage: params.storage,
          fs,
          path,
          onEvent: (event) => send({ event: event.type, ...event })
        })
      }
      return { state: await node.snapshot() }
    }
    if (!node) throw new Error('The core has not started yet')
    if (typeof node[method] !== 'function' || HIDDEN.includes(method)) throw new Error('Unknown method: ' + method)
    return (await node[method](params || {})) || {}
  }

  // Android freezes the app when it leaves the screen, and Bare Kit tells us
  // just before and just after. Without this the connections go stale and
  // take minutes to recover.
  // One after the other: a resume that arrives mid-suspend waits its turn.
  let lifecycle = Promise.resolve()
  const then = (step) => {
    lifecycle = lifecycle.then(() => (node ? step(node) : null)).catch(() => {})
  }
  Bare.on('suspend', () => then((n) => n.suspend()))
  Bare.on('resume', () => then((n) => n.resume()))

  // The stream can split or join messages, so collect bytes and cut at newlines.
  let pending = ''
  ipc.on('data', (data) => {
    pending += b4a.toString(data)
    let end
    while ((end = pending.indexOf(NEWLINE)) !== -1) {
      const line = pending.slice(0, end)
      pending = pending.slice(end + 1)
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      handle(msg).then(
        (result) => send({ id: msg.id, result }),
        (err) => send({ id: msg.id, error: err.message || String(err) })
      )
    }
  })

  // Runs before the worklet exits: close the core so its storage is free for
  // the next one. Without this, a new worklet in the same process finds the
  // storage locked.
  return async function stop() {
    if (node) await node.close()
    node = null
  }
}
