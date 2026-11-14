// Reproduces the stall seen on mobile data, on one PC.
//
// Two UDX streams (Holepunch's transport) talk through a small UDP relay that
// behaves like the real path did: it delays packets, and silently drops any
// IP packet bigger than a limit (the home router's limit is 1480 bytes).
//
//   node mtu-repro.mjs [--limit 1480] [--delay 60] [--jitter 0] [--mb 5] [--loss 0] [--cap 0]
//
// --cap N applies the workaround from core.js: UDX may not grow packets past N bytes.
// --shrink-after MS --shrink-to N lowers the limit mid-transfer, as when a route
// changes: it shows that UDX never steps its packet size back down.

import dgram from 'dgram'
import UDX from 'udx-native'
import { args } from './cli.js'
import { capPacketSize } from './core.js'

const opts = args({ limit: '1480', delay: '60', jitter: '0', mb: '5', loss: '0', cap: '0', 'shrink-after': '0', 'shrink-to': '1480' })
let LIMIT = Number(opts.limit) - 28 // IP packet size -> UDP payload size
const DELAY = Number(opts.delay)
const JITTER = Number(opts.jitter)
const LOSS = Number(opts.loss)

const udx = new UDX()
const a = udx.createSocket()
const b = udx.createSocket()
a.bind(0, '127.0.0.1')
b.bind(0, '127.0.0.1')

// The relay: A sends to relayA, which forwards to B out of relayB, and back.
const relayA = dgram.createSocket('udp4')
const relayB = dgram.createSocket('udp4')
await new Promise((r) => relayA.bind(0, '127.0.0.1', r))
await new Promise((r) => relayB.bind(0, '127.0.0.1', r))
let dropped = 0
let biggest = 0
const forward = (out, port) => (msg) => {
  if (msg.length > LIMIT) return dropped++
  if (Math.random() < LOSS) return
  biggest = Math.max(biggest, msg.length)
  setTimeout(() => out.send(msg, port, '127.0.0.1'), DELAY + Math.random() * JITTER)
}
relayA.on('message', forward(relayB, b.address().port))
relayB.on('message', forward(relayA, a.address().port))

const sender = udx.createStream(1)
const receiver = udx.createStream(2)
sender.connect(a, 2, relayA.address().port, '127.0.0.1')
receiver.connect(b, 1, relayB.address().port, '127.0.0.1')

if (Number(opts.cap) > 0) console.log('cap applied:', capPacketSize(sender, Number(opts.cap)))

const total = Number(opts.mb) * 1024 * 1024
let received = 0
const t0 = Date.now()
if (Number(opts['shrink-after']) > 0) {
  setTimeout(() => {
    LIMIT = Number(opts['shrink-to']) - 28
    console.log(`${stamp()}  path limit lowered to ${opts['shrink-to']} bytes`)
  }, Number(opts['shrink-after']))
}
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5) + 's'

let lastMtu = 0
const watch = setInterval(() => {
  if (sender.mtu !== lastMtu) {
    console.log(`${stamp()}  sender packet size (mtu) ${lastMtu || 'start'} -> ${sender.mtu}`)
    lastMtu = sender.mtu
  }
}, 5)
const progress = setInterval(() => {
  console.log(
    `${stamp()}  received ${(received / 1024 / 1024).toFixed(2)} MB, mtu ${sender.mtu}, ` +
      `retransmits ${sender.retransmits}, timeouts ${sender.rtoCount}, relay dropped ${dropped} oversize`
  )
}, 2000)

const finish = (outcome) => {
  clearInterval(watch)
  clearInterval(progress)
  console.log(`${stamp()}  ${outcome}`)
  console.log(
    `       final mtu ${lastMtu}, biggest packet the relay passed ${biggest + 28} bytes, ` +
      `limit ${LIMIT + 28}, oversize packets dropped ${dropped}`
  )
  process.exit(0)
}

receiver.on('data', (data) => {
  received += data.byteLength
  if (received >= total) finish(`DONE: ${opts.mb} MB delivered`)
})
sender.on('error', (err) => finish(`SENDER FAILED: ${err.code || err.message} after ${(received / 1024 / 1024).toFixed(2)} MB`))
receiver.on('error', () => {})

const chunk = Buffer.alloc(65536, 7)
for (let sent = 0; sent < total; sent += chunk.byteLength) sender.write(chunk)
