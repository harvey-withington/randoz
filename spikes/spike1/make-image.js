// Writes a ~5 MB file of random bytes to stand in for a photo. Random bytes
// don't compress, which is how a JPEG behaves on the wire.
//
//   node make-image.js [--out test-image.bin] [--mb 5]

import fs from 'fs'
import crypto from 'crypto'
import { args } from './cli.js'

const opts = args({ out: 'test-image.bin', mb: '5' })
fs.writeFileSync(opts.out, crypto.randomBytes(Math.round(Number(opts.mb) * 1024 * 1024)))
console.log(`wrote ${opts.out} (${opts.mb} MB)`)
