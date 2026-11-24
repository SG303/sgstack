---
name: grill
description: Use when the user writes "grill" as an instruction to sharpen an idea, feature or project before anything is built. Interview the user in rounds of questions with recommended answers until the plan is clear, then, after the user confirms, write it up as a spec in an issue. Never implements. Discussing or installing the skill does not activate it.
---

# Grill

Turn a vague idea into a spec an agent can build and verify without guessing.
This skill plans only: no code, no branches, no commits. It ends with an
issue on the repository's Git forge, or with the summary in chat if there is
no remote or issue tracker.

## Interview in rounds

1. Read the repository instructions, README and the code the idea touches.
   Facts are your job: look up anything the repo, tools or docs can answer
   instead of asking. If a lookup takes long, delegate it to a subagent and
   ask the questions that do not depend on it in the meantime.
2. Map the decisions the idea needs. Each round asks only the open decisions
   whose prerequisites are settled. A question that depends on another open
   question waits for a later round.
3. Ask at most five questions per round, numbered, in the user's language.
   Give each one a recommended answer and word it so that "yes" accepts the
   recommendation. Prefer plain language over jargon; the user decides what
   and why, you propose how.

   ```
   **Q1 – <title>**: <question, with options if useful>
   ➡️ Recommendation: <answer>
   ```

4. Recompute the open decisions after every answer and ask the next round.
   Stop when nothing is left silently assumed.

Cover these in every interview, in whatever round they become answerable:

- **Problem**: what is wrong or missing today, and for whom.
- **Out of scope**: what this explicitly does not do.
- **Done**: observable acceptance criteria.
- **Verification**: how an agent proves it works without the user checking
  by hand: which command, URL, click path or test, and what result to expect.
  An agent that cannot verify its own work leaves the user as the verifier.

## Confirm and write the spec

Summarize the agreed plan and ask the user to confirm it. Do not create the
issue before the user confirms; apply requested changes and confirm again.

Then create one issue in English with `gh issue create` on GitHub, or the
forge CLI/MCP tool documented by the repository (if there is no remote or
issue tracker, post the spec in chat instead):

```markdown
## Problem
## Solution
<from the user's point of view>
## Decisions
<choices made in the interview, without file paths or code>
## Out of scope
## Acceptance criteria
- [ ] ...
## Verification
<exact commands, URLs or steps and the expected result>
```

Report the issue URL and stop. The user starts the work — for example with
`architect` for a new project or major refactor, or directly with
`yolo #<number>`.

## Boundaries

- Creating the confirmed spec issue is the only outward-facing action. No
  labels, assignees, milestones, comments or other issues unless asked.
- No secrets, real IPs, host names or personal data in the issue; most repos
  are public. Use generic examples.
- If the idea is a small fix that needs no decisions, say so and suggest
  doing it directly instead of grilling.
