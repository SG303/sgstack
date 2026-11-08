# Testing ui-review

`fixture/` is a deliberately broken one-page site (Velomiete Seeland): placeholder-only form fields, a `div` as submit button, `outline: none`, fixed 1200 px layout, no viewport meta, low contrast, a blocking script, a late banner, fake urgency, a preselected marketing checkbox and confirmshaming.

## Smoke test (no LLM calls, about 30 s)

```sh
bash tests/smoke.sh
```

Checks that the probes catch the planted problems, that all artefacts (including a configured view and the per-iteration `tasks.json`) are written, and that element crops work for a sticky element after another crop, a missing element with an `anchor`, and a focus state at 320 px with its accessibility tree.

`node scripts/jury.mjs <mode> ... --dry-run` writes the juror prompts with their image lists to `jury/raw/` without calling a CLI, to check what the jurors would see.

## End-to-end test (LLM calls, about 15 min and a few dollars)

Run the skill as a fresh agent in a throwaway git repository that contains the fixture:

```sh
d=$(mktemp -d) && cp tests/fixture/* "$d" && mkdir -p "$d/.claude/skills" "$d/.agents/skills"
ln -s "$PWD" "$d/.claude/skills/ui-review" && ln -s "$PWD" "$d/.agents/skills/ui-review"
printf '.claude/\n.agents/\n' >"$d/.gitignore" && git -C "$d" init -q && git -C "$d" add -A && git -C "$d" commit -qm fixture
(cd "$d" && claude -p "/ui-review max 2 Iterationen" --permission-mode bypassPermissions)
(cd "$d" && codex exec --dangerously-bypass-approvals-and-sandbox '$ui-review max 2 Iterationen')
```

Results of the first runs (2026-11-05), both with two iterations:

| | Claude Code | Codex |
| --- | --- | --- |
| Gates passed | 4/19 → 14/20 | 4/19 → 12/20 |
| UEQ-S pragmatic | −0.79 → 1.54 | −1.04 → 1.25 |
| SUS | 46 → 80 | 46 → 73 |
| Blind A/B vs. original | 4:0 | 4:0 |

Both runs found the server on their own, wrote tasks, left the changes uncommitted and produced the report. Lessons that went back into the skill: the focus walk now continues through date-input segments, owner content (prices, legal texts) must be waived instead of invented, and failing perception gates pass the jurors' own words to the fixer.

First real run on a project (network-bandwidth-calculator, 2026-11-05, four iterations, 10/19 → 15/20 gates). Lessons that went back into the skill:

- Six of 22 changes could not be judged from their images: crops broke on a bottom bar that hides while the results are visible (each crop now loads the page fresh and crops fixed elements from the viewport), and focus rings, undo bars and changed accessible names need a state or the accessibility tree (`setup`, `width`, `anchor`, aria diff).
- The blind comparison only saw first screens and the desktop page, and file paths revealed the versions. It now gets mobile, 320 px, views and change crops under neutral file names.
- UEQ pragmatic moved around its target by noise alone: borderline flag and one repeat round.
- Persona issues of severity 2 never reached the worklist; personas did not know the audience; tasks ended on static labels; a text locator hit a hidden `<option>`; Codex model checks were cut off with stderr; `pkill -f` killed the calling shell (now `server.sh`).
