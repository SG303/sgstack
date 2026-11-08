---
name: takeover
description: Use when the user asks to take over or continue an existing PR, branch, or agent thread. Recover the original goal and finish its remaining work. Discussing or installing the skill does not activate it.
---

# Takeover

Finish the original goal from another contributor or agent. Treat the handoff
as context, not proof that the implementation works. No other skill is required.

## Recover the goal and state

Read the source PR, branch, or conversation, including later corrections,
review findings, tests, and unresolved decisions. In T3 Code, read a supplied
thread with `t3_thread_read` and use its returned link when referring to it.
Elsewhere use available history tools or a supplied handoff. If the source
cannot be read, request the missing context rather than inventing it.

Read repository instructions and inspect status, local diff, untracked files,
and the actual branch/head. For a PR, record its URL, state, author, base and
head SHAs, checks, and review state. Reconcile the handoff with this code.
Identify completed, unfinished, and unverified work; preserve unrelated edits.

Continue in the existing branch when that is the requested target and it can
be used safely. Do not switch a dirty checkout or overwrite someone else's
active work. Use a separate checkout through the harness's supported mechanism
when needed. Create a replacement PR only when requested or agreed; preserve
the original commits and add fixes separately instead of erasing authorship.

## Reassess and finish

Fetch the intended base and inspect relevant changes since divergence.
Check whether newer work already solves the problem, changes its assumptions,
or makes the old implementation obsolete. If the goal is superseded or the
next step requires a product decision, report the evidence and remaining
decision rather than mechanically reviving the old code.

Finish only the original goal and accepted corrections. Independently
reproduce the original problem when possible, verify the fix and realistic
workflows, and run repository-required checks. For UI or runtime changes,
use the environment's supported app/browser/device tools as appropriate.
Disclose checks that cannot run and behavior that remains unverified.

Handle straightforward conflicts only when they can be resolved without
guessing intended behavior or risking unrelated work. Prefer merging the
base when a pushed branch needs updating and repository rules permit it.
Do not force-push or rewrite published history; report the blocker if the
repository requires an incompatible update method.

## Handoff or ship within authorization

Taking over authorizes continuing the implementation, not automatically
publishing it. Commit, push, open/update a PR, merge, close the original PR,
or create a release only when the user's task already authorizes that action.
If `cpm` or `yolo` was also invoked, follow its completion scope and limits.

Preserve authorship and existing co-author trailers. Credit original
contributors and link the source in any authorized replacement PR. Preserve
human credit in a squash commit too, using verified identities, not guessed
emails. Recheck remote state before pushing so concurrent work is not lost.

If PR completion is authorized, inspect checks and existing reviews, fix
verified in-scope issues, and verify the final head before calling it ready.
Post replies only when authorized, in English, with evidence and verified
agent attribution. In T3 Code, link any PR created, taken over, or pushed to;
use `watch_pull_request` when monitoring is requested or an authorized merge
is waiting on checks/reviews, then follow its wake-up instructions. Unwatch
before a final handoff. Outside T3, use an available supported watcher and
state any inability to resume automatically. Do not invent polling loops.

Report the inherited state, what you finished, verification, preserved credit,
and remaining decisions. Include the PR URL and exact merge/release status
when applicable. Never present unfinished or unverified work as complete.
