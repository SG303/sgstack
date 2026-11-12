---
name: yolo
description: Autonomous ship mode. Use when the user writes the word "yolo" as an instruction in their prompt, usually at the end. Implement the change, test it, then finish it with the cpm workflow (commit, push, PR, squash-merge, the repo's established GitHub release process) without asking for confirmation. If the word is clearly not an instruction (e.g. it is being discussed as a term), ask once before proceeding.
---

# YOLO

The user wrote "yolo". That pre-authorizes this one task from implementation
through merge and the repo's established GitHub release process. The
authorization ends with this task.

YOLO is implementation plus `cpm`. This skill covers the implementation; the
`cpm` skill covers everything from commit to release. The repo's own rules win
over every default below.

## Flow

1. **Learn the repo rules.** Read `AGENTS.md` / `CLAUDE.md`, `CONTRIBUTING*`,
   the PR template and recent `git log`. Find the test, lint and build
   commands (docs, `package.json`, `Makefile`, CI config).
2. **Branch.** Never work on the default branch. Start from the up-to-date
   default branch and name the branch per repo convention, else
   `<type>/<short-slug>`. If you are already on a feature branch that holds
   the user's work, keep it.
3. **Implement** the requested change. Keep the diff to what was asked.
4. **Test the change itself.** Prove that the new or changed behavior works.
   Add or update automated tests where the repo has a test setup, and also
   run the change for real (run the script or CLI, call the endpoint, open
   the UI), not just read the code. Fix until it works.
5. **Run the full local checks.** Run the repo's whole test suite, lint and
   build to catch regressions elsewhere. Fix failures caused by your change.
6. **Ship with `cpm`.** Load the `cpm` skill and follow its workflow and
   boundaries to commit, push, open the PR, merge, complete the release,
   clean up and report. Its "do not implement new features" boundary refers
   to work beyond this task; the change from steps 3-5 is in scope.

## Additional limits

- Nothing outside the repo: no system config changes, no `sudo`, no deleting
  files outside the project.
- All `cpm` boundaries apply; yolo does not lift any of them.

## Stop and ask when

- Tests or CI fail and you cannot fix them within the scope of the task.
- The request is ambiguous enough that a wrong guess would get merged.
- A merge conflict is not trivial.
- The change turns out much larger or riskier than asked (destructive
  migrations, data deletion, broad rewrites).
