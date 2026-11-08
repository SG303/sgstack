---
name: sol-loop
description: Use when the user requests "sol-loop" or "sol loop" to review code changes with GPT Sol in a bounded feedback loop. Discussing or installing the skill does not activate it.
---

# Sol Loop

Use one GPT Sol reviewer to check the current change independently. Resolve
findings with the smallest justified local fixes. This does not authorize
committing, pushing, merging, releases, or posting GitHub comments.

## Scope and budget

- Read repository instructions and inspect status, diff, and untracked files.
  Preserve unrelated work; isolate the review by paths when possible.
- For a PR, fetch its actual base and head and record their SHAs. Verify that
  the local change corresponds to that PR before reviewing it.
- For local changes, use the merge base with the remote default branch.
  Without a remote, use HEAD for uncommitted changes; ask for a base if the
  intended committed range is unclear. Include relevant untracked files.
- Record the base, paths, intent, and exclusions. Keep this scope throughout
  the loop. Run relevant checks and disclose missing or pre-existing failures.
- Default to three rounds total. Extend to five only for evidenced security,
  authorization, data-loss, or concurrency issues still unresolved, or when
  the user requests it. Never treat budget exhaustion as approval.

## Select and brief the reviewer

Honor a user-named Sol version; otherwise resolve the latest available GPT
Sol model rather than hardcoding its identifier. Record only model and effort
information actually exposed by the harness.

In T3 Code, resolve models with `orchestrator_capabilities` once before the
first delegation. Use a native subagent only if it supports the chosen model
on the same provider with the required settings. Otherwise use `delegate_task`
with role `review`. Start a fresh delegation for every review round. Follow
the tool's completion instructions; do not poll, launch top-level threads,
or use thread messages to start another review. Cancel abandoned delegates.

Outside T3 Code, use the harness's supported subagent mechanism only if it
can run the selected Sol model. If no route is available, report the blocker;
do not substitute a different model without the user's instruction.

Give the reviewer this brief, filled with the actual scope:

```text
Review only. Do not edit, commit, push, post comments, or start subagents.
Repo: <absolute path>. Base: <SHA>. Paths: <scope, including untracked files>.
Intent: <desired behavior>. Exclusions: <out of scope>. Checks: <results>.
Inspect the diff and surrounding callers. Identify reproducible bugs and
mismatches with intent. Explain impact with file:line and evidence.
Use stable finding IDs and severity: blocker, should-fix, or nit.
Suggest the smallest fix; distinguish required fixes from optional follow-ups.
Return APPROVE or CHANGES, with reasons and any verification limits.
```

Do not change reviewed files while the reviewer runs. Timeout, failure,
silence, or missing output is not approval.

## Resolve and recheck

Evaluate each finding yourself. Keep a ledger with ID, severity, evidence,
and outcome: fixed, disputed, or declined. Do not downgrade a serious issue
merely because it is uncommon. Explain disagreements with code or checks.

Fix verified issues within scope and run the relevant checks. Prefer a
focused regression test when it demonstrates the actual failure. Decline
style-only changes and unrelated work with a short reason.

Later rounds receive the original scope, ledger, current diff, and changes
since the previous round. Ask them to recheck open findings and changed code,
not to restart the entire audit. No new round is needed for declined nits
or wording and formatting changes alone.

Stop when the reviewer approves the current behavior diff and no substantive
finding remains unresolved. If only nits remain, report that outcome without
claiming an APPROVE verdict that was not given. Stop on an item still disputed
after two reviewer responses, or when the budget ends; summarize both sides.

Report rounds, verified model, verdict, fixed and declined findings, checks,
remaining risks, and diff size before/after. Report usage only if supplied.
Continue an already-authorized shipping workflow only when approval covers
the current behavior diff and no substantive finding remains unresolved.
Otherwise leave shipping pending and report the review blocker. Never
force-push or bypass required reviews.
