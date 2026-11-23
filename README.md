<img src="assets/icon.svg" width="64" height="64" alt="">

# sgstack

Personal agent stack that works across harnesses (Claude Code, Codex, opencode, Antigravity):

- **Skills**: plain `SKILL.md` files in the shared Agent Skills format.
- **Global rules**: one [`global/AGENTS.md`](global/AGENTS.md) that every harness reads.
- **Baseline**: the [shared standard](baseline/README.md) for all my repositories: tool canon, checklist and templates.

Created in [T3 Code](https://t3.codes).

> [!NOTE]
> Personal project, built with AI coding agents under my supervision. Review the code carefully before you use it.

## Skills

| Skill | What it does |
| --- | --- |
| [`cpm`](skills/cpm/SKILL.md) | Write "cpm" to finalize the current task: check existing changes, commit, push, open or update a PR, squash-merge it, delete the branch and complete the release if the repo has a release process. |
| [`sol-loop`](skills/sol-loop/SKILL.md) | Write "sol loop" to review a change with one GPT Sol reviewer, resolve findings and recheck within a bounded round budget. |
| [`takeover`](skills/takeover/SKILL.md) | Ask to take over a PR, branch or agent thread: recover its goal, finish the remaining work and preserve contributor credit. |
| [`sparring`](skills/sparring/SKILL.md) | Write "sparring" or ask to think through or challenge an idea for a constructive, read-only dialogue that develops rough ideas, stress-tests assumptions, pushes back with simpler alternatives without turning cynical or sycophantic, and optionally hands off to `grill`. |
| [`grill`](skills/grill/SKILL.md) | Write "grill" with an idea to be interviewed in rounds of questions with recommended answers, then get a confirmed spec with acceptance criteria and verification steps as an issue. Plans only; build it with `yolo #<issue>`. |
| [`review`](skills/review/SKILL.md) | Ask for a general review of a project, selected code, diff, PR or non-code artifact to get a read-only report covering bugs, security, best practices, requirements fit, concrete improvements and potential new features. |
| [`ops`](skills/ops/SKILL.md) | Write "ops" or ask for a self-hosted operations task (updates, migrations, config/proxy/TLS changes, backups, cutovers, rollbacks or live troubleshooting) for a repo-first, plan-first workflow with backup/snapshot gates, GitOps awareness, live verification, cleanup retention and local infrastructure doc updates. |
| [`debug`](skills/debug/SKILL.md) | Write "debug" or ask to investigate or fix a concrete software defect (bugs, crashes, failing or flaky tests, build/CI errors, web/API issues or regressions) for an evidence-first workflow: reliable reproduction first, proven root cause with a circuit breaker against trial-and-error loops, minimal fix with a fail-before/pass-after regression test and clean removal of temporary diagnostics. |
| [`research`](skills/research/SKILL.md) | Write "research" (or "recherchiere") or ask for structured technical research, tool/library comparisons, feasibility checks or standards/API evaluations (inside a repo or with no project) for a primary-source-first, read-only-by-default workflow with three-tier evidence labeling, strict fact-vs-judgment separation, privacy redaction before external searches and optional `council` fact-checking. |
| [`bootstrap-repo`](skills/bootstrap-repo/SKILL.md) | Write "bootstrap-repo" or ask to set up a new repo, retrofit an existing repo to the SG303 baseline, prepare a private repo for going public, or run a read-only baseline audit: reads `sgstack/baseline/` live, enforces plan-first and full-history secret/PII hard gates, merges existing docs safely, keeps changes local and outputs a tailored checklist for external forge settings. |
| [`council`](skills/council/SKILL.md) | Write "council" for independent feedback from three models on different providers, with bounded review rounds and a synthesis of findings and disagreements. |
| [`ui-review`](skills/ui-review/SKILL.md) | Review a web UI against WCAG 2.2, Core Web Vitals, Nielsen, ISO 9241-110, deceptive patterns and the detected design system, with independent Claude/Codex jurors filling in UEQ-S, SUS and VisAWI-S. Reviews are read-only; an explicit request to improve or fix the UI enables iterations and a before/after report. Needs Node 18+; run `skills/ui-review/scripts/setup.sh` once. |
| [`yolo`](skills/yolo/SKILL.md) | Write "yolo" in a prompt and the agent implements, tests, commits, pushes, opens a PR, squash-merges it and completes the repo's established release process without asking. |

## Install

```sh
scripts/install.sh              # symlink skills and global rules into every harness
scripts/install.sh --uninstall  # remove those links again
```

| Harness | Skills | Global rules |
| --- | --- | --- |
| Claude Code | `~/.claude/skills` | `~/.claude/rules/sg303-global.md` (user-level rules, loaded independently of project `CLAUDE.md` files) |
| Codex | `~/.agents/skills` | `~/.codex/AGENTS.md` (or `$CODEX_HOME/AGENTS.md`) |
| opencode | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | `~/.config/opencode/AGENTS.md` |
| Antigravity | `~/.gemini/config/skills` | `~/.gemini/config/AGENTS.md` (plus `${T3CODE_HOME:-~/.t3}/userdata/providers/antigravity/*/config/AGENTS.md` when present) |

Because everything is a symlink, `git pull` updates every harness at once.
Re-run the installer after adding new skills to create their links. Existing
files that are not links to this repo are left alone and reported.

Re-run the installer to migrate the old Claude rules link. It removes
`~/.claude/AGENTS.md` only if it points to this repo and the new rule was
installed successfully. Uninstall also removes the owned legacy link.
If your personal `~/.claude/CLAUDE.md` imports `@AGENTS.md`, remove that
obsolete import after migrating. The installer never edits that file.
In a fresh Claude Code session, use `/memory` to check that
`~/.claude/rules/sg303-global.md` is loaded.

Script regression tests (isolated temporary directories, no network or model calls):
`python3 -m unittest discover -s tests -v`.

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
than silently replaced. The default council members (harness, model and
reasoning effort) are fixed in
[`skills/council/members.md`](skills/council/members.md); repository
instructions or your request can override them. `sol-loop` resolves the
latest GPT Sol model at run time.

Examples:

- `Review this change with sol loop.`
- `Use council to review the authentication design. Do not change code.`
- `Take over PR #42 and finish the remaining fixes.`

The default budgets are three rounds for `sol-loop` and two for `council`.
These skills do not grant permission to publish or merge changes. Add `cpm`
or `yolo` when you want their respective shipping workflows. `takeover` is
self-contained and does not require the other tstack skills.

The three skills are adapted from [t3dotgg/tstack](https://github.com/t3dotgg/tstack).
The interview style of `grill` is adapted from
[mattpocock/skills](https://github.com/mattpocock/skills).
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance and license.

## Permissions

A skill is an instruction, not a permission. If a harness asks before `git push` or `gh pr merge`, it still asks while a skill is active. Allow those commands in the harness's own permission settings if you want a fully hands-off run.

## Status

Personal project, built with AI coding agents under my supervision. There is
no support and no stability guarantee; review the code carefully before you
rely on it. See [LICENSE](LICENSE) for the warranty terms.

## License

[MIT](LICENSE). Adapted third-party skills keep their notices in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
