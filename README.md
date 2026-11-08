<img src="assets/icon.svg" width="64" height="64" alt="">

# sgstack

Personal agent stack that works across harnesses (Claude Code, Codex, opencode):

- **Skills**: plain `SKILL.md` files in the shared Agent Skills format.
- **Global rules**: one [`global/AGENTS.md`](global/AGENTS.md) that every harness reads.
- **Baseline**: the [shared standard](baseline/README.md) for all my repositories: tool canon, checklist and templates.

Created in [T3 Code](https://t3.codes).

## Skills

| Skill | What it does |
| --- | --- |
| [`cpm`](skills/cpm/SKILL.md) | Write "cpm" to finalize the current task: check existing changes, commit, push, open or update a PR, squash-merge it and delete the branch. |
| [`sol-loop`](skills/sol-loop/SKILL.md) | Write "sol loop" to review a change with one GPT Sol reviewer, resolve findings and recheck within a bounded round budget. |
| [`takeover`](skills/takeover/SKILL.md) | Ask to take over a PR, branch or agent thread: recover its goal, finish the remaining work and preserve contributor credit. |
| [`council`](skills/council/SKILL.md) | Write "council" for independent feedback from three models on different providers, with bounded review rounds and a synthesis of findings and disagreements. |
| [`ui-review`](skills/ui-review/SKILL.md) | Review and improve a web UI against WCAG 2.2, Core Web Vitals, Nielsen, ISO 9241-110, deceptive patterns and the detected design system, with independent Claude/Codex jurors filling in UEQ-S, SUS and VisAWI-S. Iterates until the gates pass and writes a before/after report. Needs Node 18+; run `skills/ui-review/scripts/setup.sh` once. |
| [`yolo`](skills/yolo/SKILL.md) | Write "yolo" in a prompt and the agent implements, tests, commits, pushes, opens a PR, squash-merges it and completes the repo's established GitHub release process without asking. |

## Install

```sh
scripts/install.sh              # symlink skills and global rules into every harness
scripts/install.sh --uninstall  # remove those links again
```

| Harness | Skills | Global rules |
| --- | --- | --- |
| Claude Code | `~/.claude/skills` | `~/.claude/AGENTS.md` (read directly; do not also import it from `~/.claude/CLAUDE.md`) |
| Codex | `~/.agents/skills` | `~/.codex/AGENTS.md` (or `$CODEX_HOME/AGENTS.md`) |
| opencode | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | `~/.config/opencode/AGENTS.md` |

Because everything is a symlink, `git pull` updates every harness at once.
Re-run the installer after adding new skills to create their links. Existing
files that are not links to this repo are left alone and reported.

## Global rules and baseline

[`global/AGENTS.md`](global/AGENTS.md) holds the rules every agent follows in
every repo: how I work, Git and GitHub workflow, security and the host setup.
Repo-specific facts (commands, release process, conventions) live in each
repo's own `AGENTS.md`, created from
[`baseline/templates/AGENTS.md`](baseline/templates/AGENTS.md).

[`baseline/`](baseline/README.md) defines what every repo looks like: one tool
per job ([`tools.md`](baseline/tools.md)), a checklist for the weekly health
check ([`baseline.yml`](baseline/baseline.yml)) and templates for Dependabot
and workflows.

## Reviews and handoffs

`sol-loop` needs access to a GPT Sol subagent. `council` needs three models
from distinct providers, unless you explicitly choose a smaller council.
They use T3 Code delegation when needed, or the harness's supported subagents
when those can run the selected models. Missing models are reported rather
than silently replaced. Repository instructions or your request can specify
model versions and council members; no model identifiers are hardcoded.

Examples:

- `Review this change with sol loop.`
- `Use council to review the authentication design. Do not change code.`
- `Take over PR #42 and finish the remaining fixes.`

The default budgets are three rounds for `sol-loop` and two for `council`.
These skills do not grant permission to publish or merge changes. Add `cpm`
or `yolo` when you want their respective shipping workflows. `takeover` is
self-contained and does not require the other tstack skills.

The three skills are adapted from [t3dotgg/tstack](https://github.com/t3dotgg/tstack).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance and license.

## Permissions

A skill is an instruction, not a permission. If a harness asks before `git push` or `gh pr merge`, it still asks while a skill is active. Allow those commands in the harness's own permission settings if you want a fully hands-off run.

## License

[MIT](LICENSE). Adapted third-party skills keep their notices in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
