---
name: council
description: Use when the user invokes "council" for independent review or feedback from three models on different providers. Discussing or installing the skill does not activate it.
---

# Council

Get three independent perspectives on the user's question. Keep the request's
scope: a review asks for findings, not automatic implementation or publication.

## Prepare

Read repository instructions and define the question, relevant paths or
artifacts, intent, and exclusions. For code, record the revision and working
tree changes, run relevant checks, and disclose known issues. If fixes are
already authorized, address known issues within scope before requesting
review; otherwise include them in the brief without changing code.

Honor council members named by the user or repository instructions.
Otherwise choose one strong current model from each of three distinct
providers, at high reasoning effort where supported. Resolve actual model
identifiers and supported settings rather than hardcoding versions. If a
named member or three providers are unavailable, report the limitation and
ask whether the user wants a smaller council or different members. Do not
silently substitute models or present one provider as three.

## Independent reviews

In T3 Code, call `orchestrator_capabilities` once before delegation. Use a
native subagent for a same-provider model and supported settings; use
`delegate_task` for other providers or settings the native tool cannot select.
Start independent reviews for the agreed membership in parallel (three by
default). Use fresh delegations for each
recheck, not thread messages or top-level threads. Follow each tool's
completion instructions without polling. Cancel work no longer needed.

Outside T3 Code, use the harness's supported delegation tools only if they
can reach the selected models. Missing access is a blocker, not permission
to impersonate a reviewer or silently switch routes.

Give each reviewer the same question, absolute repo/artifact paths, revision,
scope, constraints, and check results. They do not inherit this conversation.
Keep their first responses independent; do not include other reviewers' views.
Require read-only work, no subagents, and no commits, pushes, or PR comments.

For code reviews, ask for findings with stable IDs, severity, file:line,
evidence, smallest suggested fix, and APPROVE or CHANGES. Request a score out
of ten with reasoning, but do not use scores as a substitute for findings.
For design or planning, ask for tradeoffs and concrete recommendations.

## Reconcile and stop

Check claims against the code or artifacts. Deduplicate findings and explain
disagreements; a majority vote does not disprove a documented bug. Distinguish
verified issues, uncertain claims, and optional improvements.

A review-only request ends with this synthesis. Implement fixes only if the
user's task already authorizes them. Keep fixes within scope and run relevant
checks before asking reviewers to recheck changed code and unresolved findings.
Do not edit the shared review scope while reviewers are running.

Default to at most two rounds, including the initial pass. Extend to three
only for unresolved substantive security, data-loss, or concurrency findings,
or when the user requests it. Stop earlier when substantive findings are
resolved; nits do not require another round. Report unresolved disagreements
or budget exhaustion honestly. Missing or failed reviews are not approval.

Report models/providers, rounds, checks, useful findings, disagreements, and
remaining decisions. For code, include actual scores by round, writing
"no score" where absent. Report usage only when exposed. Add results to a PR
description only when creating or updating that PR is already authorized;
otherwise include them in the final answer. Do not post unsolicited comments.

Council does not authorize commits, pushes, force-pushes, merging, releases,
or bypassing required reviews. Continue any separately authorized workflow
only after reporting the council outcome.
