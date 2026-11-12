---
name: cpm
description: Use when the user instructs "cpm" or asks to commit, push and merge the current task. Finalize existing changes through a pull request and, if the repo has an established GitHub release process, complete the release, without further confirmation. Mentioning or discussing the skill does not activate it.
---

# CPM — Commit, Push, Merge

Finish the current task's changes. Invoking CPM authorizes committing,
pushing, opening or updating a PR, merging it, and completing the repo's
established GitHub release process if it has one. Authorization covers
this task only. Follow the repository's own rules.

## Workflow

1. Read the repository instructions and inspect the branch, working tree,
   diff and existing PR. Include only changes belonging to the current task.
   Preserve unrelated work.
2. Use the existing feature branch, or create one if on the default branch.
   Check the final diff for mistakes and secrets.
3. Run the checks appropriate to the changes and all checks required by
   the repository. Fix failures caused by this task within its scope.
4. Stage explicit paths and commit with a short, imperative English subject,
   unless the repository specifies another convention. If already committed,
   continue without creating an empty commit.
5. Push the branch. Update its existing PR or create one using the repository's
   template. Describe the final changes and validation.
6. Merge after required checks and reviews pass. Default to squash merge
   and delete the branch, unless the repository specifies otherwise. If the
   harness cannot wait for checks and the repo has auto-merge, enable it and
   report the merge as pending.
7. Complete the GitHub release, if the repo expects one. Inspect the repo's
   release documentation, workflows and recent releases to determine its
   versioning and release process. Proceed only after the PR has merged.
   - If CI creates the release, verify that it completes successfully.
   - If a separate release PR is required, follow that process and merge it
     only after its required checks and reviews pass.
   - If the process requires a manual GitHub release, create it using the
     repo's version, tag and release-note conventions.
   - Check for an existing release first; do not create duplicates. Verify
     that the release targets the merged commit.
   - If the repo has no releases or release process, skip this step. If a
     release is expected but its version or procedure is unclear, stop and
     ask instead of guessing. If release automation fails, report it; do not
     bypass it with a manual release.
8. Return to the default branch, update it and remove the local feature
   branch when this can be done without disturbing unrelated work.
9. Report the PR URL, merge status, release URL or status and validation.
   Clearly identify anything still pending.

If the repository explicitly permits direct pushes for this workflow,
follow that convention instead of creating a PR.
If there is no remote or no `gh`, stop after the local commit and say so.

## Boundaries

- Do not implement new features, publish packages or deploy. GitHub releases
  following the repo's established process are authorized.
- Do not include unrelated changes or secrets.
- Do not force-push, rewrite pushed history, skip hooks or signing, weaken
  checks, or bypass branch protection or required reviews (no admin merge).
- Never make checks pass by disabling, skipping or deleting tests, or by
  weakening CI or lint config.
- A permission prompt or denial from the harness is the user's decision.
  Do not work around it; report it.
- Resolve straightforward conflicts within the task's scope. Stop if
  resolution requires a product decision or risks unrelated work.
- If checks, permissions, reviews or missing tools block progress, report
  the concrete blocker and completed steps. Never claim a pending merge
  has completed.
