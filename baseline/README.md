# Baseline

The shared standard for all SG303 repositories: the same rules, tools and
workflows everywhere, whichever agent does the work.

| File | Purpose |
| --- | --- |
| [`../global/AGENTS.md`](../global/AGENTS.md) | Global rules for every agent and repo. Installed for Claude Code and Codex by `scripts/install.sh`. |
| [`tools.md`](tools.md) | Tool canon: one tool per job. |
| [`baseline.yml`](baseline.yml) | Checklist the weekly repo health check compares every repo against. |
| [`templates/`](templates) | Files to copy into a repo: `AGENTS.md`, `CLAUDE.md`, `.editorconfig`, `dependabot.yml` and workflows. |

## Three layers

1. **Agent rules** (`global/AGENTS.md`, repo `AGENTS.md`): agents know the rules.
   These are requests, not guarantees.
2. **Enforcement** (rulesets, required CI checks, Dependabot, secret scanning):
   GitHub blocks what must never happen, whatever the agent does.
3. **Drift check** (`baseline.yml` + the weekly read-only health check):
   deviations show up in the weekly report. Fixes happen in a separate,
   normal PR flow.

## Bringing a repo up to the baseline

One PR per repo:

1. Copy `templates/AGENTS.md` and `templates/CLAUDE.md`, fill in the repo
   part. If the repo already has a CLAUDE.md with project knowledge, move it
   into AGENTS.md and leave CLAUDE.md as `@AGENTS.md`. General working rules
   that the global file already covers are dropped. AGENTS.md must be a real
   file, not a symlink: Claude Code skips imports that point outside the repo.
2. Copy `templates/dependabot.yml` (only the ecosystems the repo uses),
   `templates/.editorconfig` and the matching workflows from
   `templates/workflows/`.
3. After the merge, set the repository settings (done by me or with my OK,
   because agents must not change protections on their own):
   - Ruleset on the default branch: require a pull request (0 approvals),
     require the CI checks, block force pushes and deletion, empty bypass
     list. Private repos need GitHub Pro for this.
   - Secret scanning and push protection (public repos).
   - Dependabot alerts and security updates.
   - Squash merge only, allow auto-merge, delete head branches.
   - CodeQL default setup (web apps only).

## Changing the baseline

- Change files here through a normal PR.
- Bump the version when a change needs action in the repos (new check, new
  tool, changed rule): `version` in `baseline.yml`, the header of
  `global/AGENTS.md` and `tools.md`, and the version the templates name.
  Repos then report "outdated baseline" until their AGENTS.md is updated.
- Pinned action SHAs in the templates are updated by hand when a repo's
  Dependabot updates the same action; the version comment shows which
  release a SHA belongs to.
