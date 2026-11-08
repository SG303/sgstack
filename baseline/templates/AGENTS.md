# <repo>

<One or two sentences: what it is, who uses it, how it runs (CLI, web app
behind Traefik, script …). Public or private.>

Follows the SG303 baseline v1 (`sgstack/global/AGENTS.md`,
`sgstack/baseline/tools.md`). If you cannot read those: work on a branch,
open a PR, merge only with green checks (squash); never commit secrets or
personal data; English for everything in the repo; talk to me in German.

## Commands

- Setup: `<uv sync | npm ci>`
- Test: `<uv run pytest | npm test>`
- Lint and format: `<uv run ruff check --fix && uv run ruff format | npm run lint>`
- Run locally: `<command>` (bind to 0.0.0.0, port <port>)

## Release

<How a release is made, e.g. "`npm run release -- <major|minor|patch>`, CI
tags and publishes" or "no releases".>

## Conventions

<Project knowledge an agent cannot guess: data model, where the core logic
lives, pitfalls, things that must stay in sync. Keep it to facts; general
working rules belong in the global AGENTS.md.>

## Deviations from baseline

<"none", or one line per check id from `sgstack/baseline/baseline.yml` /
tool from `tools.md` with the reason, e.g.
"- `codeql`: PHP is not supported by CodeQL.">
