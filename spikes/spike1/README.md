# Spike 1: move a photo over the Holepunch stack

Throwaway code that proves the stack (tech design §16.1). Stages 1 and 2 are
done: peers on one PC form a group, share encrypted 5 MB files through a
group log, and fetch and verify each other's. Stage 3 (Android) is part
done: the app builds and the same core runs on Android, and a phone on another network has sent a verified 5 MB item
to the PC. Same Wi-Fi, mobile networks, battery and iOS are still to do.

## Run it

Needs Node 24. One terminal per process, all in `spikes/spike1`:

```powershell
npm install
node make-image.js                       # once: writes a 5 MB test-image.bin

node bootstrap.js                        # our own DHT bootstrap node
node peer.js --name a --create yes       # first member: creates the group
node peer.js --name b                    # joins, shares, fetches
node peer.js --name c                    # as many more as you like
```

Each peer shares one file (`--file photo.jpg`, default `test-image.bin`) and
saves what the others share to `received/<name>/`. Other options:
`--secret <text>` (peers only meet if it matches) and `--bootstrap host:port`.
Each run wipes that peer's `storage/<name>` and `received/<name>`.

The same files run under Bare, the runtime the phones will use. Swap `node`
for `npx bare`, e.g. `npx bare peer.js --name b`.

## What happens

1. `bootstrap.js` starts a private DHT: a bootstrap node on
   `127.0.0.1:49737` plus five more nodes. The peers use only these, never
   Holepunch's public ones.
2. Every peer hashes the shared secret (keyed BLAKE2b) into a 32-byte topic
   and joins it on Hyperswarm, which connects them over encrypted streams.
3. The first member creates the **group log**, an Autobase. A newcomer gets
   the log's key from any member over a small invite channel and asks to be
   added; that member appends an `add-writer` entry.
4. To share, a peer encrypts the file with a random per-item key
   (XChaCha20-Poly1305, one 64 KB chunk per Hypercore block), stores the
   ciphertext with Hyperblobs on its own Hypercore, and appends an `item`
   entry to the group log.
5. Every peer watches the log. For each new item it replicates the blob from
   whoever has the blocks, decrypts it, checks size and SHA-256, and saves it.

## Files

| File | What |
|---|---|
| `core.js` | Keys, encryption, peer setup, group log, share, fetch. No file-system access, so it can move into a Bare worklet. |
| `peer.js` | A group member on the desktop (command-line wrapper around the core) |
| `mobile/` | The Android app: `App.tsx` (one screen) and `worker.js` (the core in a Bare worklet) |
| `bootstrap.js` | The DHT bootstrap node |
| `cli.js` | Argument parsing and logging |
| `make-image.js` | Writes the test file (Node only) |
| `mtu-repro.mjs` | Two UDX streams through a relay with a packet-size limit; see "The stall" (Node only) |

## Android app (stage 3)

`mobile/` is an Expo (React Native) app. `worker.js` runs `core.js` in a
Bare worklet, a second JavaScript engine inside the app, and talks to the
screen over one IPC stream. `expo-bare-kit` packs the worklet and links its
native addons into the Android project.

### One-time setup (done on this PC, 13 Nov 2026)

- Microsoft OpenJDK 17 in `%LOCALAPPDATA%ProgramsOpenJDK`
- Android SDK in `%LOCALAPPDATA%AndroidSdk` (command-line tools, platform
  36, build tools 36, emulator, one x86_64 system image, an AVD named `randoz`)
- `JAVA_HOME`, `ANDROID_HOME` and `PATH` set for the user. Open a new
  terminal to pick them up.

### Build

```powershell
powershell -ExecutionPolicy Bypass -File mobileuild-android.ps1 -Release
```

The script mirrors this folder to `S:z` and builds there, because the
project path is too long for the C++ part of a React Native build on
Windows. Edit files here, never in the mirror. The APK lands in
`S:zmobileandroidappuildoutputsapkeleaseapp-release.apk`.
Without `-Release` it makes a debug build that loads its JavaScript from
Metro (`npx expo start --dev-client` in `S:zmobile`).

### Test on a phone (same Wi-Fi as the PC)

1. Install the APK: with USB debugging on, `adb install -r S:zandoz-spike1.apk`,
   or copy the file to the phone and open it.
2. On the PC, with this PC's Wi-Fi address in place of 192.168.1.112:

   ```powershell
   node bootstrap.js --host 192.168.1.112
   node peer.js --name a --create yes --bootstrap 192.168.1.112:49737
   ```

3. In the app, check the Bootstrap field shows that address, tap
   **Join group**, and watch the log. Tap **Share 5 MB** to send the other way;
   the PC saves it to `received/a/`.

### Results so far

- The app builds on Windows and runs on the Android emulator. The worklet
  starts, the native addons load (RocksDB, sodium, UDX), and it announces
  and finds the PC peer through our bootstrap node in 33–143 ms.
- **Phone to PC works** (13 Nov 2026): a Nothing Phone (4a) on another
  network, linked to the PC over Tailscale, joined the group and shared a
  5 MB item. The PC verified it: first byte 469 ms, total 2331 ms (about
  2.1 MB/s), log entry seen after 204 ms. Tailscale does its own NAT
  traversal, so this is not yet the mobile-network test.
- **PC to phone works**, same session: the phone fetched and verified the
  PC's 5 MB item: first byte 397 ms, total 1592 ms (about 3.1 MB/s).
- **Same Wi-Fi works** (14 Nov 2026), private DHT, direct LAN connection:
  PC to phone first byte 38 ms, total 465 ms; phone to PC first byte 231 ms,
  total 626 ms. One sample each way. The connection held for about two
  minutes with the app in the foreground and dropped when the app was left.
- **Mobile data works, with one repeatable fault** (14 Nov 2026): phone on
  mobile data, PC behind the home router, public HyperDHT, no Tailscale.
  Hole-punching succeeded every time; the phone connected 3.5 s after
  joining. Phone to PC, three samples: first byte 319–361 ms, total
  1410–1462 ms (about 3.5 MB/s).
- The fault and its fix are described under "The stall" below.
- **Phone to tablet works** (14 Nov 2026), both on home Wi-Fi, public
  DHT, no PC in the group. The phone created the group (first time on
  Android) and the tablet joined and became a writer in 175 ms. 5 MB phone
  to tablet: first byte 88 ms, total 631 ms; tablet to phone: 98 ms, 815 ms.
  They connected over the LAN, 11.8 s after the tablet joined.
- **Phone on mobile data to tablet on home Wi-Fi works**, public DHT, no PC.
  The phone created the group from behind the carrier network; the tablet
  connected 5.1 s after joining and was a writer 269 ms after asking. 5 MB
  phone to tablet: 1156 and 1354 ms; tablet to phone: 1235 ms. One
  connection, no stall, held until an app was backgrounded.
- After the phone was backgrounded, the tablet's first reconnect went to
  the phone's public address, got nothing back and timed out after 13 s,
  then reconnected over the LAN.
- The first attempts failed, on the emulator and on the phone, because the
  private DHT had one node. A peer needs answers from at least three DHT
  nodes to classify its NAT before it can hole-punch. `bootstrap.js` now
  starts the bootstrap node plus five more.
- App size, release build: the APK with two architectures is 149 MB. For
  arm64 only, the native libraries are 70.6 MB installed (24.1 MB gzipped).
  `libbare-kit.so` (the Bare runtime) is 46.5 MB of that (15.2 MB gzipped),
  RocksDB 6.5 MB, React Native 7.0 MB. The worklet's JavaScript is 2.5 MB.
- Battery: see "Battery" below. Not measured: mobile to mobile, iOS.

## The stall (found and worked around, 14 Nov 2026)

**Symptom.** Across networks, the first connection stalled during the PC to
phone download and timed out after about 15 s. The peers reconnected about
18 s later and the download resumed, so the first item took 33–37 s. Seen in
4 of 4 cross-network runs; never on the LAN or over Tailscale.

**Cause.** UDX (the transport) starts with 1200-byte packets and grows them
towards 1500 by sending test packets of each larger size. On the failing
connection it stepped 1456 -> 1488 after 1.2 s. The home router drops
anything over 1480 bytes (measured: pings through a UDX socket to public
DHT nodes get 3 of 3 replies at 1480 and 0 of 3 at 1481). From that moment
every full-size packet was lost. libudx never lowers the packet size again
(`stream->mtu` is only raised or reset), so the stream retransmits at the
same size until it times out.

The second connection worked because Windows had by then learned the
router's limit, and UDX takes the operating system's value as its ceiling
when a stream connects (it stopped at 1480).

**Not explained.** UDX only steps up when a test packet is acknowledged, and
a 1488-byte packet should not get through this router. `mtu-repro.mjs`
simulates a 1480-byte limit on one PC, and there UDX correctly stops at
1456, with or without jitter and loss. So the false step was not reproduced
off the real path.

**Workaround.** `capPacketSize()` in `core.js` lowers the ceiling to 1280
bytes on every connection by writing to the stream's native state. UDX has
no setting for it. This depends on the field layout of libudx commit
9c9a0e7 (udx-native 1.22.1); it checks the values look right and does
nothing otherwise, and the log says when it was not applied.

**Result.** With the cap on the PC, on a fresh carrier address: packet size
stepped 1200 -> 1232 -> 1264 -> 1280 and stayed, the phone got the 5 MB item
in 1421 ms on the first connection, and the connection held until the app
was left. The phone was not capped in that run.

With the cap on both sides (second run, another fresh carrier address):
no stall and no disconnects. PC to phone, four 5 MB items: 2013 and 2011 ms
(fetched together, first on the connection), then 546 and 409 ms. Phone to
PC: 5386, 1653, 1373 ms.

**Still open.** The first upload from the phone on a new connection was slow
in both capped runs (6.1 s and 5.4 s, against 1.3–2.2 s for the next ones).
It is not the packet size: the phone was capped in the second run. Not
investigated; a cold start of the congestion controller on the mobile
uplink is one candidate.

**For the product.** The workaround breaks on any libudx change, so the real
fix belongs upstream: step back down after repeated timeouts (black-hole
detection, RFC 8899), or a setting to cap or disable probing.

**How old is it.** Packet-size probing has been in libudx since August
2023, and it has never had a step back down. But a libudx change dated
2 April 2026 switched probing off by accident, so streams stayed at 1200
bytes in the udx-native releases after 1.20.3 up to 1.21.2; 1.21.3 (22 September 2026) switched it back
on. Checked against the simulation: 1.20.3 probes, 1.21.2 stays at 1200,
1.22.1 probes. So the exposure is old, and has been live again for under
two months.

**Reproducing the missing step-down.** Lowering the path limit after UDX
has reached full size gives the same ending as the real fault: the packet
size stays put, six timeouts, ETIMEDOUT.

```powershell
node mtu-repro.mjs                 # UDX against a simulated 1480-byte limit: stops at 1456, correct
node mtu-repro.mjs --cap 1280      # the same with the workaround
node mtu-repro.mjs --limit 1500 --shrink-after 4000 --shrink-to 1480 --mb 60               # stalls, ETIMEDOUT
node mtu-repro.mjs --limit 1500 --shrink-after 4000 --shrink-to 1480 --mb 60 --cap 1280    # completes
```

## Battery (first reading, 14 Nov 2026)

Nothing Phone (4a), 5504 mAh battery, home Wi-Fi, screen on the whole time,
app in the foreground, in a group with the PC on the public DHT. Figures
come from Android's `dumpsys batterystats` (per-app estimates) and the
battery's charge counter (whole phone), read over wireless debugging.

| 15 minutes each | Idle in the group | A 5 MB item each way per minute |
|---|---|---|
| App's own use, Android's estimate (CPU + Wi-Fi, no screen) | 0.67 mAh | 1.46 mAh |
| Whole phone, charge counter | 43.3 mAh | 55.6 mAh |
| Screen, Android's estimate | 39.9 mAh | 40.2 mAh |
| App's CPU time | 143 s | 174 s |
| App's Wi-Fi traffic | 0.34 MB in, 0.20 MB out | 211 MB in, 310 MB out |

- The screen dominates. The app's own share while idle is about 2.7 mAh an
  hour by Android's estimate, around 0.05 % of the battery.
- Moving 521 MB cost the whole phone 12 mAh more than idling, about 0.2 % of
  the battery, or roughly 0.023 mAh per MB.
- Idle is not free: about 9 packets a second and 2.2 MB an hour of traffic,
  and 16 % of one CPU core. The CPU figure is inflated by this spike's own
  diagnostics, which poll the connection every 20 ms.
- Unexplained: the phone shared 75 MB and needed 80 MB, but sent 310 MB and
  received 211 MB. Two PC peers were in the group for the active part. Why
  the traffic was 3 to 4 times the content was not investigated.

Limits: one run; Wi-Fi only, since wireless debugging needs it; screen on;
per-app figures are model estimates. Nothing here says what a foreground
service with the screen off would cost, or mobile data.

## Data model

The group log's view is a Hyperbee (sorted key/value store):

```
member/<writer key>  ->  { addedBy, addedAt }
item/<item id>       ->  the item entry below, plus sharedBy
```

```js
{
  v: 1,
  id: '<random hex>',
  type: 'photo',                 // or 'video', 'file'
  name, mime, createdAt,
  owner: '<hex key of the core holding the blobs>',
  tiers: {
    original: { blob: { byteOffset, blockOffset, blockLength, byteLength }, size, sha256 }
    // preview and thumbnail are optional
  },
  enc: { alg: 'xchacha20poly1305/chunked', chunkSize: 65536, epoch: 0, nonce, wrappedKey },
  sharedBy: '<hex key of the writer>'   // filled in from the log, not by the sharer
}
```

Three keys come from the group secret, each a keyed hash with its own label:
the swarm topic, the epoch key that wraps item keys, and the key that
encrypts the log's own blocks.

Spike shortcuts: the invite channel has no token (the secret is the only
gate), there is one fixed epoch, and nothing is ever removed or revoked.

## Results (13 Nov 2026)

Windows 11, one PC, loopback, 5 MB of random bytes per item (81 blocks).
Nothing here crosses a real network or a NAT.

### Stage 2: group log

| | Measured |
|---|---|
| Newcomer asks to join -> can write | 38–60 ms |
| Item shared -> entry in another peer's view | 59–89 ms |
| Append an item entry to the log | 9–23 ms |
| First byte of a 5 MB item | 14–127 ms |
| Total transfer to verified plaintext | 104–273 ms |

From four runs with two or three peers on Node and Bare, mixed.

- The creator was stopped, then a third peer joined through the second. It
  became a writer, and it fetched the creator's item from the second peer,
  which had downloaded it earlier.
- In one of those two runs the third peer took 8.1 s to connect instead of
  about 20 ms. The cause wasn't investigated; the stopped peer's DHT
  announcement was still live.
- A peer that is killed is noticed by the others 12–14 s later.

### Stage 1: one blob, no group log

| | Node 24.15 | Bare 1.37.1 |
|---|---|---|
| Connection (join topic to connected, other peer already up) | 22–68 ms | 17–23 ms |
| First byte (request to first block) | 15–26 ms | 16–22 ms |
| Total transfer (request to verified plaintext) | 103–124 ms | 92–169 ms |
| Decrypt 5 MB (inside the total) | 3–13 ms | 4–10 ms |
| Encrypt 5 MB | 7–8 ms | 6 ms |
| Write 5 MB to Hypercore | 44 ms | 43 ms |

## Pinned versions

Exact versions are in `package.json` and `package-lock.json`: hyperswarm
4.17.2, hyperdht 6.36.0, hypercore 11.40.4, corestore 7.16.1, hyperblobs
2.13.0, autobase 7.28.2, hyperbee 2.27.3, protomux 3.13.1, sodium-universal
5.0.1, bare 1.37.1. Mobile (`mobile/package.json`): expo 58, react-native
0.88.1, react-native-bare-kit 0.17.1, expo-bare-kit 0.3.0.
