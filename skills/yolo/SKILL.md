---
name: yolo
description: Autonomous ship mode. Use when the user writes the word "yolo" as an instruction in their prompt, usually at the end. Implement the change, test it, then commit, push, open a PR, squash-merge it and complete the repo's established GitHub release process without asking for confirmation. If the word is clearly not an instruction (e.g. it is being discussed as a term), ask once before proceeding.
---

# YOLO

The user wrote "yolo". That pre-authorizes this one task from implementation through merge and the repo's established GitHub release process. The authorization ends with this task.

The repo's own rules win over every default below.

## Flow

1. **Learn the repo rules.** Read `AGENTS.md` / `CLAUDE.md`, `CONTRIBUTING*`, the PR template and recent `git log` (commit style). Find the test, lint and build commands (docs, `package.json`, `Makefile`, CI config).
2. **Branch.** Never work on the default branch. Start from the up-to-date default branch and name the branch per repo convention, else `<type>/<short-slug>`. If you are already on a feature branch that holds the user's work, keep it.
3. **Implement** the requested change. Keep the diff to what was asked.
4. **Test the change itself.** Prove that the new or changed behavior works. Add or update automated tests where the repo has a test setup, and also run the change for real (run the script or CLI, call the endpoint, open the UI), not just read the code. Fix until it works.
5. **Run the full local checks.** Run the repo's whole test suite, lint and build to catch regressions elsewhere. Fix failures caused by your change.
6. **Commit.** Read `git diff` first, stage explicit paths (not `git add -A`), commit in the repo's message style, in small logical commits.
7. **Push and open a PR** with `gh pr create`. Use the PR template if there is one. Title and body follow repo conventions; describe what changed and how it was tested.
8. **Wait for required checks to pass.** If there are none, continue.
9. **Merge:** `gh pr merge --squash --delete-branch`, unless the repo specifies another method. If the harness cannot wait for checks and the repo has auto-merge, use `--auto` and say clearly that the merge is still pending.
10. **Complete the GitHub release, if the repo expects one.** Inspect the repo's release documentation, workflows and recent releases to determine its versioning and release process. Proceed only after the PR has actually merged (or the authorized direct push has landed).
    - If CI creates the release, verify that it completes successfully.
    - If a separate release PR is required, follow that process and merge it only after its required checks and reviews pass.
    - If the established process requires a manual GitHub release, create it using the repo's version, tag and release-note conventions.
    - Check for an existing release first; do not create duplicates.
    - Verify that the release targets the intended merged commit and report its URL.
    - If no release is expected, skip this step. If a release is expected but its version or procedure is unclear, stop and ask instead of guessing. If release automation fails, report the failure; do not bypass it with a manual release.
11. **Clean up.** Switch to the default branch, pull, delete the local feature branch.
12. **Report** in a few lines: PR URL, merge commit, release URL or status, what was tested, anything skipped or left open. If the merge or release is still pending, say so explicitly.

If `AGENTS.md` explicitly declares the repo a solo repo with direct pushes, commit and push to the default branch instead of steps 2 and 7-9. Without that declaration, always use a PR. If there is no remote or no `gh`, stop after the local commit on the feature branch and say so.

## Hard limits (yolo does not lift these)

- No force-push, no rewriting pushed history, no `--no-verify`, no skipping hooks or signing.
- No admin merge and no bypassing branch protection or required reviews. If a required human review blocks the merge, stop and report the PR URL.
- No package publishing or deployment to external services. GitHub releases following the repo's established process are authorized.
- Nothing outside the repo: no system config changes, no `sudo`, no deleting files outside the project.
- No secrets in commits. Stop if you find any in the diff.
- Never make checks pass by disabling, skipping or deleting tests, or by weakening CI or lint config.
- A permission prompt or denial from the harness is the user's decision, not an obstacle. Do not work around it; report it.

## Stop and ask when

- Tests or CI fail and you cannot fix them within the scope of the task.
- The request is ambiguous enough that a wrong guess would get merged.
- A merge conflict is not trivial.
- The change turns out much larger or riskier than asked (destructive migrations, data deletion, broad rewrites).
