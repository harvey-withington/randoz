# RANDOZ

RANDOZ lets any group, even complete strangers, pool their photos quickly and privately.

No sign-up and no accounts. Start a group, invite people with a QR code or a
link, share photos from your gallery, and save the ones you love. Photos
travel directly between phones, encrypted end to end; nothing readable is
kept on a server. Leaving a group removes your photos from it.

**Status: early development.** An Android app is being built. Nothing is
released yet, and there is no iOS app.

## Building

Requirements: Node 24, JDK 17 and the Android SDK. `docs/BUILDING.md` has
the details, including why the build runs from a mirror folder on Windows
and how signing works.

```powershell
npm run check            # type checks
npm test                 # tests
npm run build            # signed release APK in dist\
npm run build:emulator   # the same, plus the emulator's architecture
npm run website          # landing page on http://localhost:5180
```

The npm scripts are the only entry points; VS Code tasks and CI call the
same ones.

| Folder | What |
|---|---|
| `core/` | The peer-to-peer core: groups, invites, encrypted items. Runs on Node and on Bare |
| `app/` | The Android app (React Native), with the core in a Bare worklet |
| `docs/` | `BUILDING.md`, `UI-CONVENTIONS.md` (the frontend contract) and `decisions/` |
| `spikes/` | Throwaway proofs of the technology, each with its own README |
| `website/` | The landing page, published to GitHub Pages by `.github/workflows/deploy-pages.yml` |
| `scripts/` | Build and dev helpers |

## How it works

RANDOZ is built on the [Holepunch](https://holepunch.to) modules: Hyperswarm
finds the other phones and connects to them directly, an Autobase log holds
the group's state, and each member's photos live as encrypted blobs on
their own Hypercore. `docs/decisions/` records why.

## Licence

MIT
