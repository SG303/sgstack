# Frameworks used by ui-review and why

Each framework sits where it measures best: deterministic tools for what can be measured, LLM experts for judgment, LLM personas for perceived experience, and a blind A/B comparison as a guard against regressions.

| Layer | Framework | Measured by | Gate |
| --- | --- | --- | --- |
| Accessibility | WCAG 2.2 AA (https://www.w3.org/TR/WCAG22/) | axe-core (wcag2a/aa, 21a/aa, 22aa, best practice) plus probes: 320 px reflow (1.4.10), focus walk (2.4.7, 2.4.11), clickable-but-not-focusable (2.1.1), target size on mobile (2.5.8) | 0 critical/serious, probes pass |
| Accessibility, judgment | WCAG criteria tools cannot decide; WAI-ARIA Authoring Practices (https://www.w3.org/WAI/ARIA/apg/) | expert jurors | corroborated severity ≤ 2 (sev 4 defects always block) |
| Performance | Core Web Vitals (https://web.dev/articles/vitals) | Playwright lab run with CPU ×4 and slow-4G throttling: LCP, CLS, TBT (lab proxy for INP); INP from the task walkthroughs | LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms, INP ≤ 200 ms |
| Usability | Nielsen's 10 heuristics (https://www.nngroup.com/articles/ten-usability-heuristics/), severity scale 0-4 | expert jurors | corroborated severity ≤ 2 |
| Usability, normative | ISO 9241-110:2020 interaction principles | expert jurors | (part of severity) |
| Task success | Cognitive walkthrough (Wharton et al. 1994) and scripted tasks | Playwright runs the tasks; jurors judge each step | 100 % completed |
| Interaction design | Laws of UX (https://lawsofux.com) | expert jurors | (part of severity) |
| Ethics and law | Deceptive patterns (https://www.deceptive.design), EU DSA Art. 25 | expert jurors | none |
| Content | Readability: Amstad (German), Flesch (English) on prose paragraphs | probe, rough syllable heuristic | (reported) |
| Design system | Material 3, Fluent 2, Carbon, Bootstrap, Tailwind/shadcn, GOV.UK, ... chosen from the detected stack | stack detection (DOM and package.json), expert jurors, fixer | (part of severity) |
| Perceived UX | UEQ-S (https://www.ueq-online.org) | persona jurors | pragmatic ≥ 1.5, lowest juror ≥ 0.8 (hedonic diagnostic by default) |
| Perceived usability | SUS (Brooke 1996) | persona jurors | mean ≥ 80, lowest ≥ 68 |
| Visual aesthetics | VisAWI-S (Moshagen & Thielsch 2013) | sighted persona jurors only | diagnostic by default (set `gates.visawi.mean` to enforce) |
| Regression guard | Blind pairwise comparison, both orders, on neutral file names; desktop and mobile (first screen and full page), 320 px and configured views (plus a final check against `iter-0`) | jurors from every provider | not worse and no provider net-against |

## Why the questionnaire scores are not the only goal

UEQ, SUS and VisAWI are validated for people who used a product. LLM jurors only approximate that. Known weaknesses and the countermeasures in this skill:

- **Leniency and low variance.** Jurors are told that an average site deserves middle ratings, write their rationale before the numbers, and there are several personas and at least two model families. Calibration on the fixture in `tests/`: Claude and Codex gave a deliberately broken page UEQ-S pragmatic −0.96, SUS 43, VisAWI 2.5. A free OpenCode vision model gave the same page SUS 90, so OpenCode is advisory by default.
- **Position bias.** UEQ-S items are shuffled and their poles flipped at random for every juror; the A/B comparison runs in both orders.
- **Noise.** The same jurors rate the same page differently from run to run. In the first real run the UEQ-S pragmatic mean moved 1.58 → 1.46 → 1.54 around its 1.5 target without a relevant change; the standard error of the mean over six jurors was about 0.2. A mean closer to its target than one standard error is therefore marked `borderline`, and a decision that depends on it repeats the personas once (`--append`) and averages each juror's rounds.
- **Wrong audience.** Generic personas judge a specialist tool like a consumer site (in the first run "technical terms need explanation" for a tool for network engineers). `jury.audience` makes the personas members of the real audience.
- **Over-design and checklist bloat.** Strict hedonic ("inventive", "leading edge") and VisAWI-S ("inventive") gates push calm, utilitarian UIs toward decorative bloat, and single-expert severity-3 nitpicks amplify false positives across providers. By default, `ueqs.hedonicMean` and `visawi.mean` are diagnostic (reported without failing the run; set them explicitly to enforce), the blind screen-reader persona does not receive screenshots or VisAWI-S, subjective severity-3 expert findings require cross-provider consensus when multiple experts run, and pairwise A/B includes an explicit `restraint` dimension plus a final check against `iter-0`.
- **Goodhart's law.** The fixer only sees the worklist (`strengths`, objective `defects`, and `suggestions` with trade-offs), never the questionnaire items or scores. Hard gates (axe, tasks, Web Vitals) cannot be argued away, and the blind A/B guard reverts iterations that lose or draw a net-against verdict from any provider.
- **No real usage.** Persona jurors see task walkthroughs with step screenshots (except the blind screen-reader persona, which receives the accessibility tree, focus data and walkthrough log only), not just a static screenshot.

The UEQ handbook treats scale means above 0.8 as positive and below −0.8 as negative. The defaults enforce pragmatic usability (pragmatic mean ≥ 1.5, lowest juror ≥ 0.8) and SUS (mean ≥ 80, lowest ≥ 68) while keeping hedonic quality and VisAWI-S diagnostic unless requested, because clean business and tool UIs should not be penalized for visual restraint. Set `gates.ueqs.hedonicMean` or `gates.visawi.mean` per run when visual novelty is a goal.

## Not included, and why

- Full UEQ (26 items): UEQ-S carries the same two quality dimensions at a third of the cost per juror. Add it via `data/questionnaires.json` if a study needs it.
- Lighthouse: the lab metrics are measured directly with the same throttling idea, without another 100 MB dependency. Field data (CrUX) needs a public origin and real traffic.
- Google HEART and other analytics frameworks: they need real usage data.
