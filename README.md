# RANDOZ

RANDOZ lets any group, even complete strangers, pool their photos quickly and privately.

No sign-up and no accounts. Start a group, invite people with a QR code or a
link, share photos from your gallery, and save the ones you love. Photos
travel directly between phones, encrypted end to end; nothing readable is
kept on a server. Leaving a group removes your photos from it.

**Status: a working Android app, in private testing.** It is installed by
hand from builds made on a developer's PC. It is not in an app store, there
is no release to download yet, and there is no iOS app.

## What it does

- **Groups.** Be in several at once. Each has a name and description, set by
  whoever started it; anyone else can keep their own for it.
- **Invites.** A QR code or a link, safe to post in a group chat: it does not
  contain the group's key, and whoever made it can turn it off.
- **Identities.** Appear under a name, picture and short line you choose, a
  different one in each group if you like, or stay random: each group then
  gives you a nickname such as Blue Otter.
- **Photos.** Thumbnails arrive first and the full size on demand. Photos are
  re-encoded before they leave the phone, which strips where and when they
  were taken. Save any of them to your camera roll; unshare your own.
- **Titles, descriptions and tags.** What you write on your own photo is for
  the group; on someone else's it stays on your phone.
- **Finding things.** Search, filter by person or tag, group, sort, and three
  layouts. A wide screen shows the group list and the open group side by side.
- **Blocking.** Block a member in a group and they, and everything they
  share, are gone from your phone. They are not told.
- **Staying connected.** The app can stay connected while it is off the
  screen, with Android's notification saying so.

Known limits: a member cannot be removed from a group, only blocked on your
own phone; invites meant for people standing next to you are not built; and
only photos can be shared.

## Building

Requirements: Node 24, JDK 17 and the Android SDK. `docs/BUILDING.md` has
the details, including why the build runs from a mirror folder on Windows,
how signing works and how builds are numbered.

```powershell
npm run check            # type checks
npm test                 # tests
npm run build            # signed, numbered release APK in dist\
npm run build:emulator   # the same, plus the emulator's architecture
npm run serve-apk        # a page on the local network to install a build from
npm run icons            # redraw the app's icon
npm run website          # landing page on http://localhost:5180
```

First time: `npm install` in `core/` and in `app/`. The npm scripts are the
only entry points; VS Code tasks and CI call the same ones.

| Folder | What |
|---|---|
| `core/` | The peer-to-peer core: groups, invites, identities, encrypted items. Plain JavaScript, runs on Node and on Bare. `core/tools/peer.js` is a member you can run on a desktop |
| `app/` | The Android app (React Native), with the core in a Bare worklet. `app/modules/keep-alive` is its one native module |
| `docs/` | `BUILDING.md`, `UI-CONVENTIONS.md` (the frontend contract) and `decisions/` |
| `spikes/` | Throwaway proofs of the technology, each with its own README |
| `website/` | The landing page, published to GitHub Pages by `.github/workflows/deploy-pages.yml` |
| `scripts/` | Build and dev helpers |

## How it works

RANDOZ is built on the [Holepunch](https://holepunch.to) modules. Hyperswarm
finds the other phones through a public DHT and connects to them directly.
An Autobase log, encrypted with the group's key, holds the group's state:
who is in it, what they shared, which invites exist. Each member's photos
live as encrypted blobs on their own Hypercore, each blob under its own key.
A phone has a separate key pair in every group, so nothing links what it
does in one to what it does in another.

The core runs inside the app in a [Bare](https://github.com/holepunchto/bare)
worklet; the screen only ever sees its state and calls its methods.
`docs/decisions/` records why things are the way they are.

Two things in the dependencies are worked around here and worth knowing
before upgrading them: `core/src/transport.js` caps the packet size of a
connection (a stall on paths with a small MTU), and `core/patches/apply.cjs`
makes two devices on one network find each other when their provider shows
them from different public addresses.

## Licence

MIT
