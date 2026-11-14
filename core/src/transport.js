// A workaround for a fault in UDX, the transport under every connection.
//
// UDX grows its packets from 1200 bytes towards 1500 by probing, and never
// shrinks them again. On a path with a lower limit that goes wrong: the
// connection sends packets that cannot arrive until it times out. Seen in
// every cross-network run of Spike 1; see spikes/spike1/README.md, "The
// stall", and plan/udx-mtu-issue-draft.md.
//
// UDX has no setting for this, so we reach into the stream's native state and
// lower "the largest size to try". This relies on the field order in libudx
// commit 9c9a0e7 (udx-native 1.22.1): mtu_state, mtu_probe_wanted,
// mtu_probe_count, mtu_probe_size, mtu_max, mtu. It checks that the values
// look right first and does nothing if they don't. Remove it when UDX can
// step back down, or offers a setting.

import udxBinding from 'udx-native/binding.js'

// The smallest packet size every IPv6 link must carry, and what WireGuard
// VPNs use, so it passes almost anywhere.
export const MAX_PACKET = 1280

/**
 * @param {any} raw a connection's rawStream
 * @param {number} [cap]
 * @returns {boolean} whether the cap was applied
 */
export function capPacketSize(raw, cap = MAX_PACKET) {
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
