// A member in a process of its own, so a test can kill it without warning:
// the nearest a test gets to a phone that is frozen or loses its network.
//
//   node tools/member.js <storage> <bootstrap port> <invite>

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createNode } from '../src/index.js'

const [storage, port, code] = process.argv.slice(2)
const node = await createNode({
  storage, fs, path, bootstrap: [{ host: '127.0.0.1', port: Number(port) }], onEvent() {}
})
await node.joinGroup({ code })
