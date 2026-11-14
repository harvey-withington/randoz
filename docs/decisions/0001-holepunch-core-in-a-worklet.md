# 0001. The Holepunch stack, with the core in a Bare worklet

Status: accepted
Date: 2026-11-15

## Context

RANDOZ pools photos between phones with no accounts and no readable copy on
any server. That needs peer discovery, NAT traversal, a shared group state
several people write to, and verifiable storage any member can serve.

Spike 1 (`spikes/spike1/`) tested the Holepunch modules for this: HyperDHT
and Hyperswarm, Autobase, Hyperblobs on Hypercore, running in a Bare
worklet inside a React Native app. On Android it worked on the same Wi-Fi
and across networks, phone to PC and phone to tablet, including resuming an
interrupted transfer. One serious fault turned up, in UDX's packet-size
probing, and was worked around. iOS was not tested.

Iroh was the alternative. It would have meant Rust, and building the group
log and the storage layer ourselves.

## Decision

Build on the Holepunch modules directly, not on the Pear platform.

- `core/` holds the peer-to-peer logic in plain JavaScript and runs on Node
  and on Bare.
- `app/` is a React Native (Expo) app. The core runs in a Bare worklet
  inside it and talks to the screen over one message stream.
- Android first. iOS follows only if the OS allows a good result.
- The public HyperDHT is used for now; our own DHT nodes are proven only
  on a home network.

## Consequences

- One language end to end, and the same core in the app, in tests and in
  any later desktop tool or relay.
- The core cannot use React Native or Node APIs, and the screen cannot
  reach the network. Every feature crosses the worklet boundary as a
  method and a piece of state.
- We depend on one company's libraries. Versions are pinned, and
  `core/src/transport.js` is tied to the internals of one `udx-native`
  release until UDX is fixed upstream.
- The Bare runtime adds about 55 MB installed and 19 MB of download.
- The app joins Holepunch's public DHT, so it depends on their bootstrap
  nodes and other DHT nodes see which addresses look up which topic.
