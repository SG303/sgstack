---
name: ui-review
description: Use when the user asks to review, audit, rate or improve the UI/UX of a web page or web app ("ui-review", "review the UI", "improve the UX until ..."). Reviews are read-only; code changes require an explicit request to improve or fix the UI. Measures the page (WCAG 2.2 via axe-core, Core Web Vitals, reflow, keyboard focus, detected framework and design system), lets independent LLM jurors (Claude, Codex, optional OpenCode) review it using UX frameworks and fill in UEQ-S, SUS and VisAWI-S as personas. Produces a report with screenshots and findings; authorized fixes add before/after element crops, pixel diff and the exact code changes. Works with just a URL or with no input inside a project.
---

# UI review

Evaluate a web UI against established frameworks. When the user explicitly requests improvements and the source is available, improve it in iterations until the acceptance gates pass. The user judges the result from the report.

`S` below means the directory that contains this `SKILL.md`. Run scripts as `node S/scripts/<name>.mjs`. All output goes to `.ui-review/<run-id>/` in the project (or the current directory).

Read `S/references/frameworks.md` only if the user asks why a framework is used or how a gate is defined.

## Inputs (all optional)

- A URL. Without one, detect and start the project in the current directory.
- Mode: `audit` by default, including inside a source repository and for a bare `ui-review` invocation. Requests to review, audit or rate (including "reviewen", "prüfen" and "bewerten") do not authorize code changes. Use `fix` only when the user explicitly asks to improve or fix the UI (including "verbessern" and "beheben") or selects `fix` mode, and its source is available. An audit writes review artefacts but never changes project source, configuration or dependencies. A requested review followed by "fix the findings" authorizes `fix`; "suggest improvements" remains an audit.
- Targets in plain words, for example "until all jurors give at least 1.5 on UEQ", "max 3 iterations", "only accessibility", "German personas", "use the free OpenCode models too". Translate them into a config override (next section).
- Tasks the user cares about ("booking must work", "find the price").

Ask only if the target cannot be found or started. Everything else has a default.

## 1. Prepare

1. `bash S/scripts/setup.sh` installs Playwright and axe-core once and lists the juror CLIs found (`claude`, `codex`, `opencode`). If no juror CLI is available, stop and say which one to install.
2. Create the run: `RUN=.ui-review/$(date +%Y%m%d-%H%M)`, then `mkdir -p $RUN/iter-0`. In a git repository run `bash S/scripts/snapshot.sh exclude`, so `.ui-review/` never shows up in `git status`.
3. Find the target:
   - URL given: use it.
   - No URL: `node S/scripts/detect.mjs` proposes the stack, a start command and the URL. If the proposed port is busy (`portBusy`), check that the running server really serves this project (page title or a known asset) before reusing it; otherwise start your own on a free port. In `fix` mode, install dependencies if `needsInstall` is true. In `audit` mode, report missing project dependencies as a blocker instead of installing them.
   - Start a server only through `bash S/scripts/server.sh start $RUN -- <command>` (it keeps the PID and log in `$RUN`), take the real URL from `$RUN/server.log` and run `bash S/scripts/server.sh wait URL`. Stop it with `bash S/scripts/server.sh stop $RUN` when the run ends; never use `pkill -f`. Note in the report when Web Vitals come from a dev server (pessimistic).
4. Write `$RUN/config.json` holding the overrides from the user's words. Defaults are in `S/config/defaults.json`; a `ui-review.config.json` in the project root is merged too. Examples:
   - Set `"mode"` to the mode authorized by the current request. A project config cannot authorize `fix` for a review-only request.
   - "all agents at least 1.5 UEQ" → `{"gates":{"ueqs":{"pragmaticMean":1.5,"hedonicMean":1.5,"minJuror":1.5}}}`
   - "max 3 iterations" → `{"maxIterations":3}`
   - Juror models are pinned in `jury.models` (Claude `claude-opus-5-5`, Codex `gpt-6.1-sol`) with `jury.effort` `high`, so scores stay comparable across runs. "use Sonnet as Claude juror" → `{"jury":{"models":{"claude":"claude-sonnet-5-5"}}}`. Changing models makes scores incomparable with earlier runs; say so in the report.
   - "include OpenCode" → `{"jury":{"opencode":true}}`. OpenCode free models are advisory: they are shown but not counted, because in calibration they rated a broken page as good. To make them count, also set `"advisory":[]`.
   - "only accessibility" → `{"gates":{"ueqs":{"pragmaticMean":-3,"hedonicMean":-3,"minJuror":-3},"sus":{"mean":0,"minJuror":0},"visawi":{"mean":1}}}`.
   Pass `--config $RUN/config.json` to every script call below.
5. Write `$RUN/run.json`: `{"url", "mode", "startedAt", "request": "<the user's words>", "server": "<command or null>"}`.
6. If the run lives in a temporary worktree, tell the user in the final answer that `.ui-review/` (and the report) disappears with the worktree.

## 2. Baseline (iter-0)

1. `node S/scripts/capture.mjs capture --url URL --out $RUN/iter-0 --config $RUN/config.json`
   This captures screenshots (desktop and mobile, first screen and full page, 320 px reflow, dark mode if the CSS supports it), the accessibility tree, axe-core, lab Web Vitals, the keyboard focus walk, page checks and the runtime stack. It prints a summary.
2. Look at `iter-0/desktop.png`, `iter-0/mobile.png` and `iter-0/aria-desktop.txt`, and read the README or spec if there is one. Then add to `$RUN/config.json` (both are listed in the report, so the user can correct them):
   - `jury.audience`: who the site is for, in one sentence from the README, spec or page ("network engineers sizing switch uplinks and WLAN"). The personas become members of that audience; without it they judge a specialist tool like a general consumer site.
   - `capture.views`: UI states that the first page load does not show but that matter (other tabs, an opened accordion, a second wizard step), as `{"id": "wlan", "label": "WLAN tab", "viewport": "both", "steps": [{"action": "click", "any": [{"role": "tab", "name": "WLAN"}]}]}`. They are captured for the report, the experts and the blind comparison.
   Write `$RUN/tasks.json` with the 2-4 core tasks a visitor comes for (see "Task format" below). Then run `capture.mjs capture --url URL --out $RUN/iter-0 --tasks $RUN/tasks.json --only tasks,views --config $RUN/config.json`.
3. Run both juries. They are independent of each other, so run them in parallel:
   `node S/scripts/jury.mjs experts --iter $RUN/iter-0 --config $RUN/config.json --waivers $RUN/waivers.json`
   `node S/scripts/jury.mjs personas --iter $RUN/iter-0 --config $RUN/config.json`
   Each juror is a fresh headless CLI session without project context; a full jury takes 1-3 minutes.
4. `node S/scripts/gates.mjs --iter $RUN/iter-0 --config $RUN/config.json --waivers $RUN/waivers.json` prints PASS or FAIL per gate and writes `worklist.json`. Questionnaire gates closer to their target than one standard error are marked `borderline` (see step 3.7).
5. In a git repository: `bash S/scripts/snapshot.sh take $RUN/iter-0`.

In `audit` mode, or when all gates pass already, go to step 4 (Report).

## 3. Improve (iter-1 ... iter-N)

Repeat until one of these holds. For iteration `i` with previous iteration `p = i-1`:

- All gates pass (borderline passes confirmed as in step 7).
- `maxIterations` is reached.
- Plateau: two iterations in a row bring no gate improvement. A questionnaire gate that flips while `borderline` is noise, not an improvement.
- Only questionnaire gates fail (`gates.json` `onlyPerceptionFails`) and the worklist has no item with priority 2 or higher. Further gains then need a deliberate redesign or owner input, not more fixes; say so in the report.

1. **Plan from the worklist only.** Read `$RUN/iter-p/worklist.json` and `gates.json`. The worklist holds concrete problems from axe-core, the probes, the task walkthroughs, the expert reviews, the personas' issues and the blind comparison. Do not read the questionnaires, the jurors' prompts or their individual scores, and do not tune copy or visuals towards rating words ("easy", "efficient", "inventive"). Fix the problems and the ratings follow. Optimising for the score instead of the user is the failure mode this setup guards against.
   - Merge duplicate items (several jurors often report the same problem).
   - The item "Persona notes (context)" is not a defect list. Take only concrete, observable problems from it (cut-off text, a result that is hard to find, a confusing label) and ignore judgements of taste.
   - Before changing something an earlier iteration changed on purpose, check the earlier worklists. If a new finding conflicts with an earlier one (for example "the bar is too tall" against "the bar needs its text label"), find a solution that satisfies both, or keep the earlier fix and waive the new finding with the reason.
   - Priority: failed tasks and severity 4 first, then axe critical/serious, deceptive patterns, keyboard and focus, reflow, then severity 3, Web Vitals, then the rest.
   - Pick at most `maxChangesPerIteration` (default 8) changes so the diff stays reviewable.
   - A finding you consider wrong (for example a deliberate brand decision): do not fix it. Add `{"title", "match": "<regex on the finding title>", "reason"}` to `$RUN/waivers.json`. Waivers are listed in the report for the user to judge; use them sparingly.
2. **Write the plan** to `$RUN/iter-i/changes.json`, an array of `{"id": "C<i>.<n>", "title", "why", "frameworks": ["WCAG 2.2 SC 2.4.7", "Nielsen H4"], "findings": ["F3"], "selector": "<CSS selector of the affected element, or null for global changes>", "viewport": "desktop|mobile"}`. The user judges every change from its before/after crop, so make each one show the change:
   - `"width": 320` when the change only applies below a breakpoint that the desktop and mobile viewports do not reach.
   - `"setup": [<task steps>]` when the change needs a state: `{"action": "press", "key": "Tab"}` for a focus ring, `{"action": "click", ...}` for an undo bar or an open menu, `{"action": "scroll", "y": 0}`.
   - `"anchor": "<selector>"` for a new element: the before crop shows that area instead.
   - Changes to names, roles or live regions show up as an accessibility-tree diff next to the crops; still give their `selector`.
   Then crop the current state:
   `node S/scripts/capture.mjs crop --url URL --plan $RUN/iter-i/changes.json --phase before --out $RUN/iter-i/crops --config $RUN/config.json`
3. **Edit the code.** Before the first edit, read the sections of `S/references/design-systems.md` that match the detected stack, and follow the project's own conventions (`AGENTS.md`, `CLAUDE.md`, existing components and tokens). Fix at the source: theme tokens, shared components and templates, never generated output or one-off overrides. For visual redesign work, also use a frontend design skill if one is installed (for example `frontend-design`). Keep content and features; never remove functionality to pass a gate.
4. Add `"what"` (one sentence: what changed) and `"files"` to every entry in `changes.json`. If a selector changed, update it so the after-crop finds the element. After the after-crop (step 6), check `crops/crops.json` and open the images: a failed crop, a fallback to the first screen or two identical images mean the user cannot judge the change. Fix the plan entry (`setup`, `width`, `anchor`) and crop the after phase again. The before phase cannot be retaken once the code changed, so think about `setup`, `width` and `anchor` before the first edit.
5. If the project has a quick check (type check, lint, unit tests), run it and fix what you broke. With a preview build (not a dev server), rebuild.
6. **Measure again.** Run the full capture with tasks into `$RUN/iter-i` (step 2.1 with `--tasks $RUN/tasks.json`). If visible labels changed, add alternatives to the task's `any` lists. Never remove or loosen an `expect`, and never change a task's goal. If a task was wrong (a locator artefact), fix it during the baseline, before the juries run; later corrections are recorded in `$RUN/run.json` under `"taskChanges"` with the reason. Each iteration keeps a copy of the tasks it ran (`iter-i/tasks.json`), and the report flags differences to the baseline. Then:
   `node S/scripts/capture.mjs crop --url URL --plan $RUN/iter-i/changes.json --phase after --out $RUN/iter-i/crops --config $RUN/config.json`
   `bash S/scripts/snapshot.sh take $RUN/iter-i && bash S/scripts/snapshot.sh diff $RUN/iter-p $RUN/iter-i`
7. **Judge again.** Run experts, personas and the blind pairwise comparison in parallel, then the gates:
   `node S/scripts/jury.mjs pairwise --iter $RUN/iter-i --before $RUN/iter-p --config $RUN/config.json`
   `node S/scripts/gates.mjs --iter $RUN/iter-i --config $RUN/config.json --waivers $RUN/waivers.json`
   The blind comparison sees both versions on desktop and mobile (first screen and full page), at 320 px, the configured views and up to three crops of changed elements.
   If `gates.json` lists `borderline` gates and the decision depends on them (final iteration, or the only reason to continue), repeat the personas once and evaluate again: `node S/scripts/jury.mjs personas --iter $RUN/iter-i --config $RUN/config.json --append`, then `gates.mjs`. Each juror's rounds are averaged. Do not repeat more than once per iteration.
8. **Regression guard.** If the pairwise verdict is `before` (the jurors prefer the previous version), revert this iteration with `git apply -R $RUN/iter-i/changes.patch`. Record it in `$RUN/run.json` under `"reverted"` and plan a different approach. The final state is then the last iteration that was not reverted.

Tell the user briefly after each iteration: gates passed before and after, what changed, what comes next.

## 4. Report

`node S/scripts/report.mjs --run $RUN --config $RUN/config.json [--final iter-k]` writes to `$RUN/report/`:

- `index.html`: interactive comparison (side by side, slider, pixel difference) per viewport and view, every change with before/after element crops (plus the accessibility-tree diff and a note when a crop failed or shows no visible difference), framework references and files, gates before/after with standard errors, jury scores with rationales and verified models, open findings, waivers and the code diff per iteration.
- `compare-<viewport>.png`, `compare-<viewport>-view-<id>.png` and `changes/<id>.png` (one per change): static images for chat.
- `summary.md`.

The final answer to the user contains:

1. One sentence verdict (gates passed, iterations, blind comparison result).
2. The comparison images and the change images of the most important changes (at most 4) embedded as images with absolute paths, and the absolute path of `index.html`.
3. A short gates table (before → after) and the list of changes with the reason and framework for each.
4. Open findings, waivers, open questions for the owner and anything you could not fix, with the reason.
5. Anything that limits how far the user can trust the result: changes without a usable image (the report notes them), borderline gates, task changes after the baseline, juror models or efforts the CLIs did not confirm ("unverified", "requested" in the report), and the `audience` and `views` you assumed.
6. Caveats: LLM jurors are a proxy, not real users (validate important decisions with people); Web Vitals are lab values from this machine.
7. The changes are left uncommitted in the working tree. Ask whether to commit them, and do not commit on your own. Stop the server you started (`server.sh stop $RUN`) before answering.

## Task format (`tasks.json`)

```json
[
  {
    "id": "book-bike",
    "goal": "Book an e-bike for tomorrow",
    "viewport": "desktop",
    "start": "/",
    "steps": [
      { "action": "click", "any": [{ "role": "link", "name": "Book" }, { "text": "Book" }] },
      { "action": "fill", "any": [{ "label": "Name" }, { "placeholder": "Name" }], "value": "Anna Example" },
      { "action": "select", "any": [{ "label": "Bike type" }, { "selector": "select" }], "value": "E-Bike" },
      { "action": "click", "any": [{ "role": "button", "name": "Book now" }, { "text": "OK" }] },
      { "action": "expect", "any": [{ "text": "Thank you" }] },
      { "action": "expect", "any": [{ "selector": "#booking-summary", "text": "E-Bike" }] }
    ]
  }
]
```

Actions: `click`, `fill`, `select`, `check`, `uncheck`, `focus`, `hover`, `press` (`key`), `scroll` (`y`), `goto` (`url`), `expect`, `wait` (`ms`). Targets: `role`+`name`, `label`, `placeholder`, `text` (add `"regex": true` for a pattern), `selector`, or `selector`+`text` (an element matching the selector that contains the text). List accessible targets (`role`, `label`) first in `any`. Visible matches win over hidden ones (for example a `<option>` or a closed panel with the same text). A step that only works through `placeholder`, `text` or `selector` is reported to the jurors as hard for screen-reader users.

Every task ends with an `expect` that proves the outcome: a value or message that only appears when the task worked (the computed total, the confirmation, the new row), not a heading or label that is always on the page. `gates.mjs` warns about tasks without any `expect`.

Safety: on a site that is not a local or staging instance, tasks must not submit forms that cause real effects (orders, messages, sign-ups, payments). End those tasks with an `expect` on the submit button instead of clicking it.

## Gates (defaults)

| Gate | Default |
| --- | --- |
| axe-core critical / serious | 0 / 0 |
| Reflow at 320 px, visible and unobscured focus, keyboard-reachable click targets | pass |
| LCP / CLS / TBT (lab, mobile profile) / INP (tasks) | 2500 ms / 0.1 / 200 ms / 200 ms |
| Tasks completed | 100 % |
| Highest expert severity (Nielsen 0-4), deceptive patterns | at most 2, none |
| UEQ-S pragmatic / hedonic mean, lowest juror overall | 1.5 / 0.8 / 0.8 |
| SUS mean / lowest juror | 80 / 68 |
| VisAWI-S mean | 5.0 |
| Blind A/B against the previous iteration | not worse |

## Rules

- Jurors stay independent: never pass them your own opinion, the previous scores or the change list. The scripts do the prompting.
- Never change project source, configuration or dependencies in `audit` mode; review artefacts and the local `.ui-review/` exclusion are allowed. Never commit, push or deploy as part of this skill.
- Keep the user's content, branding and features. When a gate conflicts with an explicit user requirement, the requirement wins: waive the finding with that reason.
- Business content belongs to the owner. Do not invent or change facts (prices, terms, promotions, legal texts, contact data, thresholds, what an action does) and do not rename the product's offers or core actions into something else (for example "Book" into "Demo request"). Improving wording that keeps the meaning is fine; shortening it for layout must keep it exact too ("Over 85%" is not "85%+" when exactly 85 % counts as borderline). When a finding needs owner input, waive it with the reason "owner content" and list it as an open question in the final answer.
- Fix findings that come from a measurement artefact in the probe by waiving them with evidence (what you checked manually), not by changing the page around the probe.
- If something cannot be measured (for example Chromium fails or login is required), say so in the report instead of guessing. For pages behind a login, ask the user for a test account or a storage-state file.
