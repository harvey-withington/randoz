# RANDOZ

RANDOZ lets any group, even complete strangers, pool their photos quickly and privately.

Before changing code here, read the project conventions in
`.claude/skills/conventions/SKILL.md` (or invoke the `conventions` skill):
architecture rules, the frontend contract in `docs/UI-CONVENTIONS.md`, the
checks to run and the commit message format.

- Requirements live on the project's BRUV card. `plan/` is a private
  scratchpad (its own private repo, `randoz-plan`, cloned here as
  `plan/` and ignored here): nothing there is a requirement until it is on
  the card.
- `npm run dev | build | check | test` are the entry points for every stack.
- To see a UI change rendered, use the `run-app` skill.
- Working rules live in files, never in one machine's Claude memory: public
  ones in the `conventions` skill; private ones (the BRUV card's id, how the
  owner works, the build routine) in `plan/CLAUDE.md`, imported below.

@plan/CLAUDE.md
