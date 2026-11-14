// Our own private DHT. Peers never touch Holepunch's public nodes.
//
// A bootstrap node is the first address a peer contacts to join the DHT. One
// node is not enough, though: before two peers on different networks can
// hole-punch, each asks at least three DHT nodes "what address do you see me
// at?" to work out what kind of NAT it is behind. So this starts the
// bootstrap node plus a few more ordinary nodes next to it.
//
//   node bootstrap.js [--host 127.0.0.1] [--port 49737] [--nodes 5]
//
// For phones, pass an address of this PC that the phones can reach as --host.

import process from 'process'
import DHT from 'hyperdht'
import { args, log } from './cli.js'

const opts = args({ host: '127.0.0.1', port: '49737', nodes: '5' })
const port = Number(opts.port)

const first = DHT.bootstrapper(port, opts.host)
await first.ready()
log(`bootstrap node listening on ${opts.host}:${first.address().port}`)

const nodes = [first]
for (let i = 0; i < Number(opts.nodes); i++) {
  const node = new DHT({
    ephemeral: false, // a full DHT node, not just a client
    firewalled: false,
    bootstrap: [{ host: opts.host, port }]
  })
  await node.fullyBootstrapped()
  nodes.push(node)
}
log(`${nodes.length - 1} more DHT nodes on ports ${nodes.slice(1).map((n) => n.address().port).join(', ')}`)
log('leave this running; Ctrl+C to stop')

process.once('SIGINT', async () => {
  for (const node of nodes.reverse()) await node.destroy()
  process.exit(0)
})
