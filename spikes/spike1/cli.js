// Small helpers for the command-line wrappers (not part of the core).

import process from 'process'
export const DEFAULT_BOOTSTRAP = '127.0.0.1:49737'

// Reads `--name value` pairs from the command line.
export function args(defaults) {
  const out = { ...defaults }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '')
    if (!(name in out) || argv[i + 1] === undefined) {
      console.error(`Unknown or incomplete option: ${argv[i]}`)
      console.error(`Options: ${Object.keys(out).map((k) => '--' + k).join(' ')}`)
      process.exit(1)
    }
    out[name] = argv[i + 1]
  }
  return out
}

// 'host:port' -> the shape Hyperswarm and HyperDHT want.
export function parseBootstrap(value) {
  return value.split(',').map((entry) => {
    const [host, port] = entry.trim().split(':')
    return { host, port: Number(port) }
  })
}

const start = Date.now()
export function log(...parts) {
  const t = ((Date.now() - start) / 1000).toFixed(3).padStart(7)
  console.log(`[${t}s]`, ...parts)
}

export function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

export function shortKey(buf) {
  return buf.toString('hex').slice(0, 8)
}
