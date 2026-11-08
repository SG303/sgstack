# Frameworks used by ui-review and why

Each framework sits where it measures best: deterministic tools for what can be measured, LLM experts for judgment, LLM personas for perceived experience, and a blind A/B comparison as a guard against regressions.

| Layer | Framework | Measured by | Gate |
| --- | --- | --- | --- |
| Accessibility | WCAG 2.2 AA (https://www.w3.org/TR/WCAG22/) | axe-core (wcag2a/aa, 21a/aa, 22aa, best practice) plus probes: 320 px reflow (1.4.10), focus walk (2.4.7, 2.4.11), clickable-but-not-focusable (2.1.1), target size on mobile (2.5.8) | 0 critical/serious, probes pass |
| Accessibility, judgment | WCAG criteria tools cannot decide; WAI-ARIA Authoring Practices (https://www.w3.org/WAI/ARIA/apg/) | expert jurors | severity ≤ 2 |
| Performance | Core Web Vitals (https://web.dev/articles/vitals) | Playwright lab run with CPU ×4 and slow-4G throttling: LCP, CLS, TBT (lab proxy for INP); INP from the task walkthroughs | LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms, INP ≤ 200 ms |
| Usability | Nielsen's 10 heuristics (https://www.nngroup.com/articles/ten-usability-heuristics/), severity scale 0-4 | expert jurors | severity ≤ 2 |
| Usability, normative | ISO 9241-110:2020 interaction principles | expert jurors | (part of severity) |
| Task success | Cognitive walkthrough (Wharton et al. 1994) and scripted tasks | Playwright runs the tasks; jurors judge each step | 100 % completed |
| Interaction design | Laws of UX (https://lawsofux.com) | expert jurors | (part of severity) |
| Ethics and law | Deceptive patterns (https://www.deceptive.design), EU DSA Art. 25 | expert jurors | none |
| Content | Readability: Amstad (German), Flesch (English) | probe, rough syllable heuristic | (reported) |
| Design system | Material 3, Fluent 2, Carbon, Bootstrap, Tailwind/shadcn, GOV.UK, ... chosen from the detected stack | stack detection (DOM and package.json), expert jurors, fixer | (part of severity) |
| Perceived UX | UEQ-S (https://www.ueq-online.org) | persona jurors | pragmatic ≥ 1.5, hedonic ≥ 0.8, lowest juror ≥ 0.8 |
| Perceived usability | SUS (Brooke 1996) | persona jurors | mean ≥ 80, lowest ≥ 68 |
| Visual aesthetics | VisAWI-S (Moshagen & Thielsch 2013) | persona jurors | mean ≥ 5.0 |
| Regression guard | Blind pairwise comparison, both orders, on neutral file names; desktop and mobile (first screen and full page), 320 px, configured views and crops of the changed elements | jurors from every provider | new version not worse |

## Why the questionnaire scores are not the only goal

UEQ, SUS and VisAWI are validated for people who used a product. LLM jurors only approximate that. Known weaknesses and the countermeasures in this skill:

- **Leniency and low variance.** Jurors are told that an average site deserves middle ratings, write their rationale before the numbers, and there are several personas and at least two model families. Calibration on the fixture in `tests/`: Claude and Codex gave a deliberately broken page UEQ-S pragmatic −0.96, SUS 43, VisAWI 2.5. A free OpenCode vision model gave the same page SUS 90, so OpenCode is advisory by default.
- **Position bias.** UEQ-S items are shuffled and their poles flipped at random for every juror; the A/B comparison runs in both orders.
- **Noise.** The same jurors rate the same page differently from run to run. In the first real run the UEQ-S pragmatic mean moved 1.58 → 1.46 → 1.54 around its 1.5 target without a relevant change; the standard error of the mean over six jurors was about 0.2. A mean closer to its target than one standard error is therefore marked `borderline`, and a decision that depends on it repeats the personas once (`--append`) and averages each juror's rounds.
- **Wrong audience.** Generic personas judge a specialist tool like a consumer site (in the first run "technical terms need explanation" for a tool for network engineers). `jury.audience` makes the personas members of the real audience.
- **Goodhart's law.** The fixer only sees the worklist (concrete problems), never the questionnaire items or scores. Persona feedback reaches it as concrete issues and as neutral notes without scale names. Hard gates (axe, tasks, Web Vitals) cannot be argued away, and the blind A/B guard reverts iterations the jurors consider worse.
- **No real usage.** Persona jurors see task walkthroughs with step screenshots and, for the screen-reader persona, the accessibility tree and focus data, not just a static screenshot.

The UEQ handbook treats scale means above 0.8 as positive and below −0.8 as negative. The default targets (pragmatic 1.5 = clearly good, hedonic 0.8 = positive) are deliberately asymmetric: business UIs rarely score high on novelty, and in both end-to-end tests hedonic quality improved least. Raise them per run if needed.

## Not included, and why

- Full UEQ (26 items): UEQ-S carries the same two quality dimensions at a third of the cost per juror. Add it via `data/questionnaires.json` if a study needs it.
- Lighthouse: the lab metrics are measured directly with the same throttling idea, without another 100 MB dependency. Field data (CrUX) needs a public origin and real traffic.
- Google HEART and other analytics frameworks: they need real usage data.
