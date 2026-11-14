// A group member on the desktop. Joins (or creates) the group, shares one
// file through the group log, and saves every item the others share.
//
//   node peer.js --name a --create yes --file photo.jpg     (first member)
//   node peer.js --name b --file other.jpg                  (everyone else)
//
// Other options: --secret demo  --bootstrap 127.0.0.1:49737
// Use --file none to only receive. --repeat 60 shares the file again every 60
// seconds (for longer tests such as battery measurement).

import process from 'process'
import fs from 'fs'
import path from 'path'
import { startMember, describeFetch } from './core.js'
import { args, parseBootstrap, log, DEFAULT_BOOTSTRAP } from './cli.js'

const opts = args({
  name: 'a',
  create: 'no',
  file: 'test-image.bin',
  secret: 'demo',
  bootstrap: DEFAULT_BOOTSTRAP,
  repeat: '0'
})

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic' }
const storage = path.join('storage', opts.name)
const outDir = path.join('received', opts.name)

// Start clean each run so the numbers aren't helped by an earlier run.
fs.rmSync(storage, { recursive: true, force: true })
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

const member = await startMember({
  storage,
  bootstrap: parseBootstrap(opts.bootstrap),
  secret: opts.secret,
  create: opts.create === 'yes',
  log,
  onItem(item, result) {
    const out = path.join(outDir, item.name)
    if (result.ok) fs.writeFileSync(out, result.bytes)
    console.log('')
    for (const line of describeFetch(item, result)) console.log('  ' + line)
    if (result.ok) console.log(`  saved           ${out}`)
    console.log('')
  }
})

let shares = 0
async function share() {
  const suffix = shares++ === 0 ? '' : '-' + shares
  await member.share(fs.readFileSync(opts.file), {
    type: 'photo',
    name: `${opts.name}${suffix}-${path.basename(opts.file)}`,
    mime: MIME[path.extname(opts.file).toLowerCase()] || 'application/octet-stream'
  })
}

if (opts.file !== 'none') {
  await share()
  if (Number(opts.repeat) > 0) setInterval(() => share().catch((err) => log('share failed: ' + err.message)), Number(opts.repeat) * 1000)
}

process.once('SIGINT', async () => {
  await member.close()
  process.exit(0)
})
