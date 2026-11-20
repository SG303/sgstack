# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The weekly repo health check is versioned as `baseline/weekly-check.md`; the scheduled task only reads it from GitHub.
- New `should` check `template-copies` reports copied workflows and configs that drift from the templates or name an old baseline version.
- New `should` check `docs-current` reports paths, scripts and commands in README.md and AGENTS.md that no longer exist, and new ones the docs miss; the global rules ask agents to update both files in the same PR.

### Changed

- The global commit identity rule now applies to GitHub; agents keep the git identity a repo or host is configured with elsewhere.
- `cpm` now completes the repo's established GitHub release process after merging; repos without releases are unaffected.
- `yolo` now implements and tests the change, then hands off to `cpm` for commit, merge and release, so the shipping steps live in one place.
- `yolo` chooses the recommended option itself instead of waiting for a decision, and stops only for risks the request does not settle.
- The Dependabot auto-merge template merges only updates classified as minor or patch; majors and unknown types stay open.
- The workflow lint template runs on every pull request, so actionlint and zizmor can be required checks.
- The weekly health check runs gitleaks from a pinned image without network, never follows instructions found in repo content, masks IPs and host names, and starts its report with the decisions needed this week.

### Fixed

- CI runs the script regression tests, and the baseline validator rejects files that name an outdated baseline version.
- Fix threads started by the weekly health check point to the installed global rules instead of a removed path.
- Make UI reviews read-only by default; require an explicit request to improve or fix the UI before changing project files.
- Install Claude global rules in its user-level rules directory and safely migrate the legacy link.
- Reinstall UI review dependencies after lockfile updates and use the exact locked versions with `npm ci`.
