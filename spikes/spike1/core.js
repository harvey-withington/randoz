// Spike 1 core: everything the peers share. No file system or process access
// here, so this file can move into a Bare worklet on mobile unchanged.

import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import Hyperblobs from 'hyperblobs'
import Autobase from 'autobase'
import Hyperbee from 'hyperbee'
import Protomux from 'protomux'
import c from 'compact-encoding'
import sodium from 'sodium-universal'
import b4a from 'b4a'
import udxBinding from 'udx-native/binding.js'

const TAG = sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES // 16
const NONCE = sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES // 24
const KEY = sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES // 32

// One encrypted chunk is exactly one Hyperblobs block (64 KB), so a reader
// can later fetch and decrypt any block on its own (sparse download).
export const CIPHER_CHUNK = 65536
const PLAIN_CHUNK = CIPHER_CHUNK - TAG

const hex = (buf) => b4a.toString(buf, 'hex')
const unhex = (str) => b4a.from(str, 'hex')

// --- Keys and hashes --------------------------------------------------------

// Every key the group needs is a keyed BLAKE2b hash of the group secret with
// a different label, so knowing one (e.g. the topic) reveals none of the others.
function derive(secret, label) {
  const root = b4a.alloc(32)
  sodium.crypto_generichash(root, b4a.from(secret))
  const out = b4a.alloc(32)
  sodium.crypto_generichash(out, b4a.from('randoz/spike1/' + label), root)
  return out
}

// What DHT nodes see: 32 random-looking bytes.
export const topicFromSecret = (secret) => derive(secret, 'topic')
// Wraps per-item keys. The real design rotates this when a member is removed.
const epochKey = (secret) => derive(secret, 'epoch/0')
// Encrypts the group log's own blocks (Autobase block encryption).
const logKey = (secret) => derive(secret, 'log')

export function sha256(buf) {
  const out = b4a.alloc(32)
  sodium.crypto_hash_sha256(out, buf)
  return hex(out)
}

function randomBytes(n) {
  const buf = b4a.alloc(n)
  sodium.randombytes_buf(buf)
  return buf
}

// --- Per-item encryption ----------------------------------------------------

// The key is random and used for one item only, so the chunk index is a safe
// nonce. The "last chunk" flag in the nonce makes a truncated blob fail.
function chunkNonce(index, isLast) {
  const nonce = b4a.alloc(NONCE)
  nonce.writeUInt32LE(index, 0)
  nonce[8] = isLast ? 1 : 0
  return nonce
}

export function encryptItem(plain) {
  const key = randomBytes(KEY)
  const chunks = []
  const count = Math.max(1, Math.ceil(plain.byteLength / PLAIN_CHUNK))
  for (let i = 0; i < count; i++) {
    const part = plain.subarray(i * PLAIN_CHUNK, (i + 1) * PLAIN_CHUNK)
    const out = b4a.alloc(part.byteLength + TAG)
    const nonce = chunkNonce(i, i === count - 1)
    sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(out, part, null, null, nonce, key)
    chunks.push(out)
  }
  return { key, chunks }
}

// Throws if the chunk was altered, reordered or encrypted with another key.
export function decryptChunk(cipher, key, index, isLast) {
  const out = b4a.alloc(cipher.byteLength - TAG)
  const nonce = chunkNonce(index, isLast)
  sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(out, null, cipher, null, nonce, key)
  return out
}

// The item key goes into the group log wrapped with the epoch key, so someone
// holding the log but not the group secret (a blind peer) can't open items.
function wrapKey(itemKey, secret) {
  const nonce = randomBytes(sodium.crypto_secretbox_NONCEBYTES)
  const boxed = b4a.alloc(itemKey.byteLength + sodium.crypto_secretbox_MACBYTES)
  sodium.crypto_secretbox_easy(boxed, itemKey, nonce, epochKey(secret))
  return { epoch: 0, nonce: hex(nonce), wrappedKey: hex(boxed) }
}

function unwrapKey(enc, secret) {
  const boxed = unhex(enc.wrappedKey)
  const itemKey = b4a.alloc(boxed.byteLength - sodium.crypto_secretbox_MACBYTES)
  const ok = sodium.crypto_secretbox_open_easy(itemKey, boxed, unhex(enc.nonce), epochKey(secret))
  if (ok === false) throw new Error('Could not unwrap the item key (wrong group secret?)')
  return itemKey
}

// --- Packet size cap (workaround) ---------------------------------------------

// UDX, the transport under every connection, grows its packets from 1200
// bytes towards 1500 by probing, and never shrinks them again. On a path
// with a lower limit that goes wrong (see README, "The stall"): the
// connection sends packets that can't arrive until it times out.
//
// UDX has no setting for this, so we reach into the stream's native state and
// lower "the largest size to try". This relies on the field order in libudx
// commit 9c9a0e7 (udx-native 1.22.1): mtu_state, mtu_probe_wanted,
// mtu_probe_count, mtu_probe_size, mtu_max, mtu. It checks that the values
// look right first and does nothing if they don't. Returns true if applied.
// 1280 bytes is the smallest packet size every IPv6 link must carry, and what
// WireGuard-based VPNs such as Tailscale use, so it passes almost anywhere.
export const MAX_PACKET = 1280

export function capPacketSize(raw, cap) {
  const mtuOffset = udxBinding.offsetof_udx_stream_t_mtu
  const handle = raw && raw._handle
  if (!handle || typeof mtuOffset !== 'number' || mtuOffset < 20) return false

  // Five 32-bit fields end where the 16-bit mtu field starts.
  const fields = new Int32Array(handle.buffer, handle.byteOffset + mtuOffset - 20, 5)
  const [state, , , probeSize, max] = fields
  const sane = state >= 1 && state <= 4 && probeSize >= 1200 && probeSize <= 1500 && max >= 1200 && max <= 1500
  if (!sane || raw.mtu > cap) return false

  fields[4] = Math.min(max, cap) // mtu_max
  if (probeSize > cap) fields[3] = cap // a probe not yet sent
  return true
}

// --- Peer -------------------------------------------------------------------

// A peer is a Corestore (its Hypercores on disk) plus a Hyperswarm (its
// connections). Every connection replicates every core both sides have open.
export async function createPeer({ storage, bootstrap, onConnection }) {
  const store = new Corestore(storage)
  await store.ready()

  const swarm = new Hyperswarm({ bootstrap })
  swarm.on('connection', (conn, info) => {
    conn.on('error', () => {}) // a peer going away is not a crash
    store.replicate(conn)
    onConnection(conn, info)
  })

  return {
    store,
    swarm,
    // Starts announcing and looking for peers on the group's topic. Resolves
    // once the DHT knows about us; connections can arrive before that.
    join(secret) {
      return swarm.join(topicFromSecret(secret), { server: true, client: true }).flushed()
    },
    async close() {
      await swarm.destroy()
      await store.close()
    }
  }
}

// --- Group log ---------------------------------------------------------------

// The group log is an Autobase: each member appends to their own Hypercore,
// and Autobase merges all of them into one agreed order. `apply` turns that
// order into the "view", here a Hyperbee (a sorted key/value store):
//
//   member/<writer key>  -> { addedBy, addedAt }
//   item/<item id>       -> the item entry, plus sharedBy (the writer's key)
//
// `apply` can be re-run when the order changes, so it must only touch the view.
// Pass `key` to open an existing group, or null to create a new one.
export async function openGroup(store, key, secret) {
  const base = new Autobase(store.namespace('group'), key, {
    valueEncoding: 'json',
    encryptionKey: logKey(secret),
    ackInterval: 1000,
    open: (viewStore) =>
      new Hyperbee(viewStore.get('view'), {
        extension: false,
        keyEncoding: 'utf-8',
        valueEncoding: 'json'
      }),
    async apply(nodes, view, host) {
      for (const node of nodes) {
        const entry = node.value
        const from = hex(node.from.key) // set by Autobase, can't be faked
        if (entry.type === 'add-writer') {
          // Members can write but don't vote on the order (indexer: false).
          await host.addWriter(unhex(entry.key), { indexer: false })
          await view.put('member/' + entry.key, { addedBy: from, addedAt: entry.at })
        } else if (entry.type === 'item') {
          await view.put('item/' + entry.item.id, { ...entry.item, sharedBy: from })
        }
      }
    }
  })
  await base.ready()
  return base
}

export function addWriter(base, writerKey) {
  return base.append({ type: 'add-writer', key: hex(writerKey), at: Date.now() })
}

export async function listItems(base) {
  const items = []
  for await (const { value } of base.view.createReadStream({ gte: 'item/', lt: 'item0' })) {
    items.push(value)
  }
  return items
}

// --- Sharing and fetching an item -------------------------------------------

// Encrypts the bytes, stores them as one blob on this peer's own core and
// appends the item entry to the group log.
export async function shareItem(store, base, secret, plain, { type, name, mime }) {
  const core = store.get({ name: 'blobs' })
  const blobs = new Hyperblobs(core, { blockSize: CIPHER_CHUNK })
  await blobs.ready()

  const t0 = Date.now()
  const { key, chunks } = encryptItem(plain)
  const encryptMs = Date.now() - t0

  const ws = blobs.createWriteStream()
  for (const chunk of chunks) ws.write(chunk)
  ws.end()
  await new Promise((resolve, reject) => {
    ws.once('close', resolve)
    ws.once('error', reject)
  })
  const storeMs = Date.now() - t0 - encryptMs

  const item = {
    v: 1,
    id: hex(randomBytes(16)),
    type, // 'photo' | 'video' | 'file'
    name,
    mime,
    createdAt: Date.now(),
    owner: hex(core.key), // the core that holds the blobs
    // Only `original` is required. `preview` and `thumbnail` are optional so
    // non-image items can leave them out.
    tiers: {
      original: { blob: ws.id, size: plain.byteLength, sha256: sha256(plain) }
    },
    enc: { alg: 'xchacha20poly1305/chunked', chunkSize: CIPHER_CHUNK, ...wrapKey(key, secret) }
  }

  const t1 = Date.now()
  await base.append({ type: 'item', item })
  return { item, encryptMs, storeMs, logMs: Date.now() - t1 }
}

// Downloads one tier of an item from whoever in the swarm has its blocks,
// decrypts it and checks the hash. Returns the bytes and timings.
export async function fetchItem(store, secret, item, tierName = 'original') {
  const tier = item.tiers[tierName]
  const key = unwrapKey(item.enc, secret)
  const chunkSize = item.enc.chunkSize

  const core = store.get({ key: unhex(item.owner) })
  const blobs = new Hyperblobs(core, { blockSize: chunkSize })
  await blobs.ready()

  const t0 = Date.now()
  let firstByteMs = null
  let decryptMs = 0
  let received = 0
  let index = 0
  let pending = b4a.alloc(0)
  const plain = []

  const decryptReady = (flush) => {
    while (pending.byteLength >= chunkSize || (flush && pending.byteLength > 0)) {
      const chunk = pending.subarray(0, chunkSize)
      pending = pending.subarray(chunk.byteLength)
      const isLast = received === tier.blob.byteLength && pending.byteLength === 0
      const t = Date.now()
      plain.push(decryptChunk(chunk, key, index++, isLast))
      decryptMs += Date.now() - t
    }
  }

  for await (const data of blobs.createReadStream(tier.blob)) {
    if (firstByteMs === null) firstByteMs = Date.now() - t0
    received += data.byteLength
    pending = pending.byteLength ? b4a.concat([pending, data]) : data
    decryptReady(false)
  }
  decryptReady(true)

  const bytes = b4a.concat(plain)
  const totalMs = Date.now() - t0
  const ok = bytes.byteLength === tier.size && sha256(bytes) === tier.sha256
  return { bytes, ok, firstByteMs, totalMs, decryptMs, received }
}

// --- Invite handshake ---------------------------------------------------------

// A newcomer needs two things the swarm topic doesn't give them: the group
// log's key, and to be added as a writer. This small channel does both, on
// the same connection the cores replicate over (Protomux lets several
// protocols share one connection). It stands in for the QR invite (tech
// design 4.3): there is no invite token, the shared secret is the only gate.
//
//   member   -> newcomer : { type: 'welcome', groupKey }
//   newcomer -> member   : { type: 'join', writerKey }
export function inviteChannel(conn, { onOpen, onMessage }) {
  const mux = Protomux.from(conn)
  const channel = mux.createChannel({
    protocol: 'randoz/spike1/invite',
    onopen: () => onOpen(send)
  })
  const message = channel.addMessage({
    encoding: c.json,
    onmessage: (msg) => onMessage(msg, send)
  })
  const send = (msg) => message.send(msg)
  channel.open()
}

// --- A group member -----------------------------------------------------------

// Everything a member does, shared by the desktop peer and the phone worklet:
// join the swarm, get into the group (create it, or be invited by whoever we
// meet first), and fetch and verify every item the others share.
//
//   log(text)             progress messages
//   onItem(item, result)  an item from someone else was fetched; result.bytes
//                         holds the plaintext if result.ok
export async function startMember({ storage, bootstrap, secret, create, log, onItem }) {
  let base = null // the group log, once we have it
  let tJoin = 0
  const handled = new Set() // item ids already fetched or being fetched
  const short = (key) => (typeof key === 'string' ? key : hex(key)).slice(0, 8)

  let becameWriter
  const writable = new Promise((resolve) => (becameWriter = resolve))

  const peer = await createPeer({
    storage,
    bootstrap,
    onConnection(conn, info) {
      const raw = conn.rawStream // the UDP stream under the encryption
      const capped = capPacketSize(raw, MAX_PACKET)
      const where = raw ? `${raw.remoteHost}:${raw.remotePort}` : 'unknown address'
      log(
        `connected to peer ${short(info.publicKey)} at ${where} (${Date.now() - tJoin} ms after joining)` +
          (capped ? '' : '; packet size cap NOT applied')
      )
      // Keep the last transport statistics, so a dropped connection can say why.
      let stats = ''
      const sample = () => {
        if (!raw || raw.destroyed) return
        stats =
          `mtu ${raw.mtu}, rtt ${raw.rtt} ms, sent ${raw.bytesTransmitted} B in ${raw.packetsTransmitted} packets, ` +
          `received ${raw.bytesReceived} B, retransmits ${raw.retransmits}, timeouts ${raw.rtoCount}`
      }
      const sampler = setInterval(sample, 1000)
      // UDX grows its packet size (mtu) by probing. Log each step, because a
      // size the path can't carry stalls the connection.
      let mtu = 0
      const tConn = Date.now()
      const mtuWatch = setInterval(() => {
        if (!raw || raw.destroyed || raw.mtu === mtu) return
        log(
          `  packet size to ${short(info.publicKey)}: ${mtu || 'start'} -> ${raw.mtu} at +${Date.now() - tConn} ms ` +
            `(sent ${raw.bytesTransmitted} B, retransmits ${raw.retransmits})`
        )
        mtu = raw.mtu
      }, 20)
      let reason = 'closed normally'
      conn.on('error', (err) => (reason = err.code || err.message))
      conn.on('close', () => {
        clearInterval(sampler)
        clearInterval(mtuWatch)
        log(`peer ${short(info.publicKey)} disconnected: ${reason} [${stats}]`)
      })
      inviteChannel(conn, {
        // If we're already in the group, tell the other side where its log is.
        onOpen(send) {
          if (base) send({ type: 'welcome', groupKey: hex(base.key) })
        },
        async onMessage(msg, send) {
          if (msg.type === 'welcome' && !base) {
            await enterGroup(unhex(msg.groupKey))
            send({ type: 'join', writerKey: hex(base.local.key) })
          } else if (msg.type === 'join' && base && base.writable) {
            const known = await base.view.get('member/' + msg.writerKey)
            if (!known) {
              await addWriter(base, unhex(msg.writerKey))
              log(`added ${short(msg.writerKey)} to the group as a writer`)
            }
          }
        }
      })
    }
  })

  async function enterGroup(key) {
    base = await openGroup(peer.store, key, secret)
    base.on('update', () => fetchNewItems().catch((err) => log('fetch failed: ' + err.message)))
    if (base.writable) return becameWriter()

    const t0 = Date.now()
    log(`found group ${short(base.key)}; asking to be added as ${short(base.local.key)}`)
    base.once('writable', () => {
      log(`now a writer (${Date.now() - t0} ms after asking)`)
      becameWriter()
    })
  }

  // Runs on every change to the group log: fetch whatever we haven't seen yet.
  async function fetchNewItems() {
    for (const item of await listItems(base)) {
      if (handled.has(item.id)) continue
      handled.add(item.id)
      const seenMs = Date.now() - item.createdAt
      const result = await fetchItem(peer.store, secret, item)
      await onItem(item, { ...result, seenMs })
    }
  }

  if (create) {
    await enterGroup(null)
    log(`created group, log key ${short(base.key)}`)
  }

  tJoin = Date.now()
  await peer.join(secret)
  log(`announced on the group topic (${Date.now() - tJoin} ms)`)

  return {
    // Waits until we're allowed to write, then shares the bytes as one item.
    async share(plain, meta) {
      await writable
      const shared = await shareItem(peer.store, base, secret, plain, meta)
      handled.add(shared.item.id)
      const mb = (plain.byteLength / 1024 / 1024).toFixed(2)
      log(
        `shared "${meta.name}" (${mb} MB): encrypt ${shared.encryptMs} ms, ` +
          `store ${shared.storeMs} ms, log entry ${shared.logMs} ms`
      )
      return shared
    },
    close: () => peer.close()
  }
}

// One-line-per-field summary of a fetched item, for logs on any platform.
export function describeFetch(item, result) {
  const tier = item.tiers.original
  const mb = (tier.size / 1024 / 1024).toFixed(2)
  return [
    `item            ${item.type} "${item.name}", ${mb} MB, ${tier.blob.blockLength} blocks`,
    `shared by       writer ${item.sharedBy.slice(0, 8)}, blobs on core ${item.owner.slice(0, 8)}`,
    `verified        ${result.ok ? 'yes (size and SHA-256 match)' : 'NO - hash mismatch'}`,
    `log entry seen  ${result.seenMs} ms   (shared -> in our view; needs synced clocks)`,
    `first byte      ${result.firstByteMs} ms   (request -> first block)`,
    `total transfer  ${result.totalMs} ms   (request -> verified plaintext)`,
    `decrypt         ${result.decryptMs} ms   (included in total)`
  ]
}
