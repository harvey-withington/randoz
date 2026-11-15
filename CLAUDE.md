# RANDOZ

RANDOZ lets any group, even complete strangers, pool their photos quickly and privately.

Before changing code here, read the project conventions in
`.claude/skills/conventions/SKILL.md` (or invoke the `conventions` skill):
architecture rules, the frontend contract in `docs/UI-CONVENTIONS.md`, the
checks to run and the commit message format.

- It is two packages: `core/` (the peer-to-peer core, plain JavaScript, runs
  on Node and on Bare) and `app/` (the Android app, React Native in
  TypeScript, with the core in a Bare worklet). `README.md` says what the
  app does; `docs/decisions/` says why it is built the way it is.
- Requirements live on the project's BRUV board. `plan/` is a private
  scratchpad (its own private repo, `randoz-plan`, cloned here as
  `plan/` and ignored here): nothing there is a requirement until it is on
  a card.
- `npm run check | test | build | build:emulator | serve-apk | icons` are
  the entry points, from the repo root. A build takes several minutes: run
  it in the background.
- There is no way to see the app in a browser. To see a UI change rendered,
  use the `run-app` skill, which drives the Android emulator.
- Anything that needs two members (sharing, who is online, blocking) cannot
  be seen in the emulator: it cannot connect to another member. Test it in
  the core's tests, say plainly that the screen was not seen, and leave it
  to the owner's devices.
- This repo and `randoz-plan` both have a remote. The owner pushes; Claude
  commits and never pushes (see the conventions).
- Working rules live in files, never in one machine's Claude memory: public
  ones in the `conventions` skill; private ones (the BRUV cards' ids, how
  the owner works, the build routine) in `plan/CLAUDE.md`, imported below.

@plan/CLAUDE.md
