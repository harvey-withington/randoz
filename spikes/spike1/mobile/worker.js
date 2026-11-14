// The P2P core on the phone. This file runs in a Bare worklet (a separate
// JavaScript engine inside the app), not in React Native, and talks to the
// screen over one IPC stream: one JSON message per line, in both directions.
//
//   screen -> worklet   { cmd: 'start', storage, bootstrap, secret, create }
//                       { cmd: 'share', mb }
//   worklet -> screen   { event: 'log', text }

const fs = require('bare-fs')
const path = require('bare-path')
const b4a = require('b4a')
const sodium = require('sodium-universal')
const { startMember, describeFetch } = require('../core.js')

module.exports = function start(ipc) {
  let member = null
  let shared = 0

  const send = (msg) => ipc.write(b4a.from(JSON.stringify(msg) + '\n'))
  const log = (text) => send({ event: 'log', text })

  const commands = {
    async start({ storage, bootstrap, secret, create }) {
      if (member) return log('already started')
      const outDir = path.join(storage, 'received')
      const coreDir = path.join(storage, 'cores')
      // Start clean each run so the numbers aren't helped by an earlier run.
      fs.rmSync(coreDir, { recursive: true, force: true })
      fs.mkdirSync(outDir, { recursive: true })

      log(`starting: bootstrap ${bootstrap.host}:${bootstrap.port}, ${create ? 'creating' : 'joining'} group`)
      member = await startMember({
        storage: coreDir,
        bootstrap: [bootstrap],
        secret,
        create,
        log,
        onItem(item, result) {
          const out = path.join(outDir, item.name)
          if (result.ok) fs.writeFileSync(out, result.bytes)
          for (const line of describeFetch(item, result)) log('  ' + line)
          if (result.ok) log('  saved           ' + out)
        }
      })
    },

    // Shares random bytes standing in for a photo of the given size.
    async share({ mb }) {
      if (!member) return log('not started yet')
      const plain = b4a.alloc(Math.round(mb * 1024 * 1024))
      sodium.randombytes_buf(plain)
      await member.share(plain, {
        type: 'photo',
        name: `phone-${++shared}.bin`,
        mime: 'application/octet-stream'
      })
    }
  }

  // The stream can split or join messages, so collect bytes and cut at newlines.
  let pending = ''
  ipc.on('data', (data) => {
    pending += b4a.toString(data)
    let end
    while ((end = pending.indexOf('\n')) !== -1) {
      const msg = JSON.parse(pending.slice(0, end))
      pending = pending.slice(end + 1)
      const run = commands[msg.cmd]
      if (!run) log('unknown command: ' + msg.cmd)
      else run(msg).catch((err) => log(`${msg.cmd} failed: ${err.stack || err.message}`))
    }
  })

  log('worklet ready')
}
