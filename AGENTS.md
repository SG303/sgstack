# sgstack

Personal, harness-neutral agent stack: skills, global agent rules and the baseline for all SG303 repositories. Used with Claude Code, Codex and opencode via T3 Code.

This repo defines the SG303 baseline and follows it (baseline v1): work on a
branch, open a PR, merge only with green checks (squash); English for
everything in the repo; talk to me in German.

## Commands

- Install for all harnesses: `scripts/install.sh` (`--uninstall` removes the links)
- Lint shell scripts: `shellcheck scripts/*.sh skills/*/scripts/*.sh && shfmt -d .`
- Validate the baseline: `uv run --no-project --with pyyaml python scripts/check-baseline.py`
- Lint the workflow templates: see "Changing global rules and the baseline" below
- ui-review smoke test (no LLM calls, needs Chromium via `skills/ui-review/scripts/setup.sh`):
  `skills/ui-review/tests/smoke.sh`

## Layout

- `skills/<name>/SKILL.md`: one directory per skill. The directory name equals the `name` in the frontmatter.
- `global/AGENTS.md`: global rules for every agent and repo, symlinked to `~/.codex/AGENTS.md`, `~/.claude/AGENTS.md` and `~/.config/opencode/AGENTS.md`.
- `baseline/`: tool canon (`tools.md`), checklist for the weekly health check (`baseline.yml`) and templates for other repos.
- `scripts/install.sh`: symlinks skills and global rules into every harness.

## Writing skills

- Portable frontmatter only: `name` and `description`. No harness-specific fields, so every harness accepts the file.
- The `description` decides when a skill loads. State the trigger first and keep it under 1024 characters.
- Keep the body short and concrete (well under 500 lines). Move long reference material into files next to `SKILL.md`.
- Write skills in English.
- Test a skill in a throwaway repo before relying on it: does it trigger, does it stop where it should?

## Changing global rules and the baseline

- `global/AGENTS.md` is loaded into every session of every agent: keep it short (well under 100 lines), concrete and in English.
- Templates must pass `actionlint` and `zizmor` (`docker run --rm -v "$PWD":/repo:ro -w /repo rhysd/actionlint:<version> baseline/templates/workflows/*.yml`, `uvx zizmor baseline/templates`). Pin actions to a full commit SHA with a version comment.
- Bump the baseline version when a change needs action in other repos (see `baseline/README.md`).

## Workflow

- Changes go through a PR and are squash-merged; delete the branch afterwards.
- Commit messages: imperative, English, short subject line.
- Run `shellcheck` and `shfmt -d` on shell scripts.

## Deviations from baseline

- none

This repo is public: never add host names, user names, IPs or other details
of my machines to the rules or skills.
