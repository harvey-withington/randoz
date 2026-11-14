// Changes made to dependencies after they are installed. Runs from
// `postinstall`, and is safe to run again. Each change names the exact text
// it replaces in one pinned version, and fails loudly if that text is not
// there: read the change again before upgrading the package.
//
// hyperdht 6.36.0, lib/connect.js: the same-network shortcut.
//   Two peers that reach the DHT from the same public address try each
//   other's local addresses, which connects in well under a second. Behind
//   a carrier-grade NAT, two devices on one Wi-Fi can show *different*
//   public addresses; hyperdht then skips the shortcut and tries to punch
//   through the NAT, which fails after about 11 seconds, again and again.
//   With this change the shortcut is also tried when the other peer has a
//   private address on one of our own subnets. If nothing answers there,
//   hole punching carries on as before.

const fs = require('fs')
const path = require('path')

const MARK = '// RANDOZ patch'

const changes = [
  {
    file: 'hyperdht/lib/connect.js',
    version: ['hyperdht/package.json', '6.36.0'],
    edits: [
      [
        `  if (c.lan && relayed && clientAddress.host === serverAddress.host) {
    const serverAddresses = payload.addresses4.filter(onlyNonReserved)

    if (serverAddresses.length > 0) {
      const myAddresses = Holepuncher.localAddresses(c.dht.io.serverSocket)
      const addr =`,
        `  ${MARK}: also try the shortcut when the public addresses differ but
  // the server has a private address on one of our own subnets.
  const sameHost = clientAddress.host === serverAddress.host
  if (c.lan && relayed) {
    const myAddresses = Holepuncher.localAddresses(c.dht.io.serverSocket)
    const serverAddresses = payload.addresses4.filter(
      sameHost ? onlyNonReserved : (addr) => onSameSubnet(addr, myAddresses)
    )

    if (serverAddresses.length > 0) {
      const addr =`
      ],
      [
        `function diffAddress(a, b) {`,
        `${MARK}: a private address whose first three numbers match one of ours.
function onSameSubnet(addr, myAddresses) {
  const [a, b, c] = addr.host.split('.').map(Number)
  const isPrivate = a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
  if (!isPrivate) return false
  const net = a + '.' + b + '.' + c + '.'
  return myAddresses.some((mine) => mine.host.startsWith(net))
}

function diffAddress(a, b) {`
      ]
    ]
  }
]

const modules = path.join(__dirname, '..', 'node_modules')

for (const change of changes) {
  const file = path.join(modules, change.file)
  let text = fs.readFileSync(file, 'utf8')
  if (text.includes(MARK)) continue

  const [pkg, wanted] = change.version
  const found = JSON.parse(fs.readFileSync(path.join(modules, pkg), 'utf8')).version
  if (found !== wanted) throw new Error(`patches: ${pkg} is ${found}, and the patch was written for ${wanted}`)

  for (const [from, to] of change.edits) {
    if (!text.includes(from)) throw new Error(`patches: text to replace not found in ${change.file}`)
    text = text.replace(from, to)
  }
  fs.writeFileSync(file, text)
  console.log('patched ' + change.file)
}
