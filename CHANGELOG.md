# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `cpm` now completes the repo's established GitHub release process after merging; repos without releases are unaffected.
- `yolo` now implements and tests the change, then hands off to `cpm` for commit, merge and release, so the shipping steps live in one place.

### Fixed

- Make UI reviews read-only by default; require an explicit request to improve or fix the UI before changing project files.
- Install Claude global rules in its user-level rules directory and safely migrate the legacy link.
- Reinstall UI review dependencies after lockfile updates and use the exact locked versions with `npm ci`.
