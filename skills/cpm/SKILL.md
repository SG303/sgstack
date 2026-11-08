---
name: cpm
description: Use when the user instructs "cpm" or asks to commit, push and merge the current task. Finalize existing changes through a pull request without further confirmation. Mentioning or discussing the skill does not activate it.
---

# CPM — Commit, Push, Merge

Finish the current task's changes. Invoking CPM authorizes committing,
pushing, opening or updating a PR, and merging it. Authorization covers
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
   and delete the branch, unless the repository specifies otherwise.
7. Return to the default branch, update it and remove the local feature
   branch when this can be done without disturbing unrelated work.
8. Report the PR URL, merge status and validation. Clearly identify anything
   still pending.

If the repository explicitly permits direct pushes for this workflow,
follow that convention instead of creating a PR.

## Boundaries

- Do not implement new features, publish releases or deploy.
- Do not include unrelated changes or secrets.
- Do not force-push, rewrite pushed history, skip hooks, weaken checks,
  or bypass branch protection or required reviews.
- Resolve straightforward conflicts within the task's scope. Stop if
  resolution requires a product decision or risks unrelated work.
- If checks, permissions, reviews or missing tools block progress, report
  the concrete blocker and completed steps. Never claim a pending merge
  has completed.
