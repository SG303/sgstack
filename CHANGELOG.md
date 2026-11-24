# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- New `spark` skill breaks idea blocks: it gathers read-only context within a fixed budget (recent agent threads, recently active repositories, local docs, a few privacy-safe web searches) and returns 10-15 surprising, source-grounded idea sparks from rotating angles, handing the picked one to `sparring`. `sparring` now focuses on developing or challenging an existing idea and points to `spark` when there is none.
- New `bootstrap-repo` skill guides new repository setup, existing repository baseline retrofits, private-to-public readiness, and read-only baseline audits using `sgstack/baseline/` as the single source of truth, with plan-first approval, a full-history secret/PII hard gate, safe doc merging, forge neutrality, local-only edits, non-bypassable `yolo` gates and a tailored external forge settings checklist.
- New `research` skill guides structured, source-backed technical research (compact lookups and in-depth comparisons/feasibility checks, with or without an open repository) with primary-source priority, three-tier evidence labeling, strict fact-vs-judgment separation, privacy redaction before external searches, read-only chat reports by default, non-implementing `yolo` handling and optional `council` fact-checking.
- New `sparring` skill acts as a constructive, read-only thought partner in chat to develop rough ideas and stress-test assumptions upstream of `grill`, pairing grounded pushback and simpler alternatives with anti-sycophancy/anti-cynicism guardrails and optional read-only repo/web reality checks.
- New `debug` skill guides systematic software debugging (diagnose-only and debug-and-fix paths) with a strict reproduction gate, methodical hypothesis testing and root-cause proof, a circuit breaker against trial-and-error loops, fail-before/pass-after regression tests, mandatory cleanup of temporary diagnostics and non-bypassable gates under `yolo`.
- New `ops` skill guides self-hosted operations tasks (read-only diagnostics and plan-first live changes) with repo-first context, live-vs-doc drift checks, GitOps precedence, backup/snapshot gates, post-change verification, cleanup retention and local documentation updates.
- `scripts/install.sh` now installs global rules (`~/.gemini/config/AGENTS.md`) and skills (`~/.gemini/config/skills`) for Antigravity alongside Claude Code, Codex and opencode.
- New `review` skill performs a lightweight, read-only review of a project, selected code, diff, PR or non-code artifact covering bugs, security, best practices, requirements fit, concrete improvements and potential new features.
- New `grill` skill interviews you about an idea in rounds of questions with recommended answers and writes the confirmed plan as a GitHub spec issue with acceptance criteria and verification steps.
- The weekly repo health check is versioned as `baseline/weekly-check.md`; the scheduled task only reads it from GitHub.
- New `should` check `template-copies` reports copied workflows and configs that drift from the templates or name an old baseline version.
- New `should` check `docs-current` reports paths, scripts and commands in README.md and AGENTS.md that no longer exist, and new ones the docs miss; the global rules ask agents to update both files in the same PR.

### Changed

- `cpm` and `grill` now work forge-neutrally when a repository documents another Git forge CLI or MCP tool; `cpm` also requires English release notes, verifies tag-triggered releases, stops temporary task servers/containers and handles linked git worktrees cleanly on branch cleanup.
- `global/AGENTS.md` adds Antigravity, prefers focused high-signal behavior tests, adds real-data plausibility and reverse-proxy HTTPS header (`X-Forwarded-Proto`) checks, asks for UI test login credentials and safe PID/container server shutdown (never `pkill -f`), and requires deleting temporary secret files immediately after use.
- `council` uses fixed default members from `skills/council/members.md` (Claude Code Opus 5.5, Codex GPT Sol 6.2 and Antigravity Gemini Neon, each at high effort) instead of picking models at run time.
- `ui-review` now separates objective defects from subjective design suggestions (with explicit trade-offs and preserved strengths), adds a product `profile` (`kind`, `density`, `notes`) to avoid checklist bloat on apps/tools, keeps `ueqs-hedonic` and `visawi` diagnostic by default, excludes the blind screen-reader persona from screenshots and VisAWI-S, requires cross-provider consensus for subjective severity-3 expert findings, tightens blind A/B regression guarding (`contested` verdict, `restraint` dimension, symmetric image budget, baseline check against `iter-0`), and fixes probe false positives (roving tabindex, `:focus-within`/pseudo-element focus rings, prose-only readability, text-length check on long lines, WCAG 2.5.8 24px non-inline mobile targets, 2x screenshot DPI and truncated-tile notices) plus report round-averaging.
- `yolo` treats a referenced issue's acceptance criteria and verification steps as the definition of done, and `cpm` links the implemented issue with `Closes #<number>`.
- The global commit identity rule now applies to GitHub; agents keep the git identity a repo or host is configured with elsewhere.
- `cpm` now completes the repo's established GitHub release process after merging; repos without releases are unaffected.
- `yolo` now implements and tests the change, then hands off to `cpm` for commit, merge and release, so the shipping steps live in one place.
- `yolo` chooses the recommended option itself instead of waiting for a decision, and stops only for risks the request does not settle.
- The Dependabot auto-merge template merges only updates classified as minor or patch; majors and unknown types stay open.
- The workflow lint template runs on every pull request, so actionlint and zizmor can be required checks.
- The weekly health check runs gitleaks from a pinned image without network, never follows instructions found in repo content, masks IPs and host names, and starts its report with the decisions needed this week.

### Fixed

- `scripts/install.sh` now also links `global/AGENTS.md` into existing T3 Code Antigravity provider directories (`${T3CODE_HOME:-~/.t3}/userdata/providers/antigravity/*/config/AGENTS.md`), because T3 Code launches Antigravity with an isolated `--gemini-dir` instead of reading `~/.gemini/config/AGENTS.md`.
- CI runs the script regression tests, and the baseline validator rejects files that name an outdated baseline version.
- Fix threads started by the weekly health check point to the installed global rules instead of a removed path.
- Make UI reviews read-only by default; require an explicit request to improve or fix the UI before changing project files.
- Install Claude global rules in its user-level rules directory and safely migrate the legacy link.
- Reinstall UI review dependencies after lockfile updates and use the exact locked versions with `npm ci`.
