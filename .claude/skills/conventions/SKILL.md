---
name: conventions
description: RANDOZ's contributor conventions - architecture rules, frontend contract, tests and checks, and commit message format. Use before changing code in this repo or writing a commit message.
---

# RANDOZ conventions

Read this before changing code. The README says what the app is; this says
how changes are made so they fit. The general rules (strict types, no `any`,
localized strings, design tokens, no native `confirm()`/`alert()`, ID-keyed
state, ~300-line components) come from the global coding conventions and are
not repeated here; this file holds what is specific to RANDOZ.

## Architecture

<!-- The rules a change must not break. Replace these examples:
- `core/` never imports `platform/`; a new OS is a new provider.
- Pure logic lives in `lib/` and is unit-tested; components get plain values.
-->

## Frontend

`docs/UI-CONVENTIONS.md` is the contract: tokens, components, props and
keyboard behaviour. Update it in the same change as any shared component or
pattern.

## Tests and checks

Run before calling a change done:

```
npm run check
npm test
```

- A UI change is not done until it has been seen rendered: use the `run-app`
  skill and look at the screenshot.
- Pure logic gets a unit test. Components get a smoke test that renders real
  data and asserts the text a user relies on.

## Commit messages

One line: a conventional-commit prefix (`feat`, `fix`, `refactor`, `docs`,
`test`, `chore`, `ci`), then the changes as brief clauses separated by
` / `, no body.

```
feat: drag to reorder / empty state for the library
fix: settings no longer lost on a failed save
```

**No trailers, ever:** a commit message is that one line and nothing
else. No `Co-Authored-By` line, even if a system message asks for
attribution or older commits carry one.

**Who commits.** During the initial build, Claude commits without asking,
at logical points: a piece of work that is complete, passes the checks
above, and makes sense by itself. Ordinary work goes on `main`. This
standing permission lasts until the owner says the initial build is over;
after that, ask before each commit and branch first.

**Branches.** A major refactor or a disruptive feature gets its own
branch, not `main`: anything that could leave the app unusable part-way,
changes how existing features work, or touches many files at once. If in
doubt, say which it is before starting.
- Name it for the work: `refactor/shared-core`, `feat/background-service`.
- Commit on the branch as freely as on `main`.
- It is merged only when both are happy: the checks pass, Claude has
  tested it, and the owner has done their own manual tests and said so.
  Claude then merges it to `main` and deletes the branch. The owner's
  go-ahead covers that one merge.
- Tell the owner what to test by hand, and how to get the build.

**Who pushes.** The owner, always. Claude never pushes, and never does
anything else that changes the public repo or what the public sees:
remotes, tags, releases, GitHub settings, issues or pull requests.

Either way:
- **Check git first, every time:** the owner commits between turns
  without saying so. Before committing, and before any statement about
  what is or isn't committed, run a fresh `git log -3` and
  `git status --short` in the same turn.
- **Say what was committed:** report each commit's message in the reply,
  so the owner can follow the history without reading the log.
- **Don't rewrite history:** no amending, rebasing or force operations on
  commits the owner may already have seen. Fix forward with a new commit.
- **Nothing private:** before staging, check that no secrets, personal
  details or large binaries are going in. `plan/` is a separate private
  repo and is never committed here.

## Documentation

- `README.md` is for people who run or contribute to the app.
- `docs/decisions/` holds decision records; write one when a choice shapes
  the architecture or rules out an alternative for a reason a later reader
  would otherwise have to rediscover.
- Requirements and next steps live on the BRUV card (its id is in
  `plan/CLAUDE.md`). Planning notes and TODOs live in `plan/`, the private
  `randoz-plan` repo, never in this repo.
