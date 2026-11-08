# Expert review checklist

Condensed from the frameworks listed in `frameworks.md`. Jurors receive this file verbatim.

## 1. WCAG 2.2 level AA: criteria that need judgment

axe-core already covers the mechanical part (contrast of text, missing names, ARIA misuse). Check what it cannot:

- 1.1.1 Non-text content: is alt text meaningful for its purpose? Decorative images empty (`alt=""`)?
- 1.3.1 Info and relationships: real headings, lists, tables, fieldsets; visual grouping matches the markup.
- 1.3.2 Meaningful sequence / 2.4.3 Focus order: reading and tab order follow the visual order.
- 1.3.5 Identify input purpose: personal-data fields use `autocomplete`.
- 1.4.1 Use of colour: information (errors, required, links in text) is not conveyed by colour alone.
- 1.4.4 Resize text / 1.4.10 Reflow / 1.4.12 Text spacing: no loss of content at 200 % text or 320 CSS px width.
- 1.4.11 Non-text contrast: input borders, icons, focus rings, chart lines at least 3:1.
- 1.4.13 Content on hover or focus: tooltips and menus dismissible, hoverable, persistent.
- 2.1.1 Keyboard: everything clickable is reachable and operable by keyboard (no `div` buttons).
- 2.2.2 Pause, stop, hide: auto-updating content (countdowns, carousels, tickers) can be paused.
- 2.4.2 Page titled, 2.4.4 Link purpose, 2.4.6 Headings and labels: descriptive, not "click here" or "OK".
- 2.4.7 Focus visible / 2.4.11 Focus not obscured (new in 2.2): indicator visible and not hidden by sticky bars.
- 2.5.3 Label in name: the accessible name contains the visible label.
- 2.5.7 Dragging movements (new): every drag interaction has a single-pointer alternative.
- 2.5.8 Target size minimum (new): targets at least 24 x 24 CSS px or sufficiently spaced.
- 3.2.3 / 3.2.4 Consistent navigation and identification; 3.2.6 Consistent help (new).
- 3.3.1 Error identification, 3.3.2 Labels or instructions, 3.3.3 Error suggestion: errors say what and how to fix, next to the field.
- 3.3.7 Redundant entry (new) and 3.3.8 Accessible authentication (new): no re-typing known data, no cognitive tests for login.
- 4.1.2 Name, role, value: custom widgets follow the WAI-ARIA Authoring Practices pattern (dialog, tabs, menu, combobox, disclosure).

## 2. Nielsen's 10 usability heuristics

- H1 Visibility of system status: feedback for every action, loading and progress states.
- H2 Match between system and the real world: users' words, natural order, familiar conventions.
- H3 User control and freedom: undo, cancel, back, clearly marked exits.
- H4 Consistency and standards: same words and patterns for the same things; platform conventions (Jakob's law).
- H5 Error prevention: constraints, good defaults, confirmation for destructive actions.
- H6 Recognition rather than recall: options visible, labels persistent (placeholders are not labels).
- H7 Flexibility and efficiency of use: shortcuts and accelerators for experts without hurting novices.
- H8 Aesthetic and minimalist design: no competing elements; every element earns its place.
- H9 Help users recognise, diagnose and recover from errors: plain-language errors with a way forward.
- H10 Help and documentation: help where it is needed, searchable, task-oriented.

## 3. ISO 9241-110:2020 interaction principles

Suitability for the user's tasks, self-descriptiveness, conformity with user expectations, learnability, controllability, use-error robustness, user engagement. Cite the principle name.

## 4. Cognitive walkthrough (per task step)

1. Will the user try to achieve the right effect?
2. Will the user notice that the correct action is available?
3. Will the user associate the correct action with the effect they want?
4. After the action, will the user see that progress is being made?

A "no" on any question for a core task is at least severity 3.

## 5. Laws of UX (cite by name)

Fitts (size and distance of targets), Hick (number of choices), Jakob (follow conventions), Miller / chunking, Tesler (complexity has to live somewhere: not with the user), Doherty threshold (respond within 400 ms), Von Restorff (one thing stands out: make it the primary action), serial position, aesthetic-usability effect, goal-gradient, peak-end, Gestalt proximity, similarity, common region.

## 6. Visual design

- One clear primary action per view; visual hierarchy matches task priority.
- Type: a consistent scale, body text at least 16 px, line length about 45-75 characters, adequate line height.
- Spacing: a consistent scale (for example 4/8 px); related items close, unrelated items apart.
- Alignment to a grid; consistent component styling (radius, borders, shadows).
- Colour: defined roles (primary, surface, text, error, success), enough contrast, works in dark mode if offered.
- Imagery is relevant, sharp and correctly sized.

## 7. Content and microcopy

- Plain language; readability scores: Amstad (German) or Flesch (English) of at least 60 for a general audience.
- Buttons say what happens ("Book bike", not "OK"); the same action keeps the same name throughout.
- Error messages state what went wrong and how to fix it; no blame, no "Error!".
- Consistent terminology; no unexplained jargon.

## 8. Forms

Visible persistent labels, sensible input types and `autocomplete`, required fields marked, inline validation after leaving a field, errors next to the field and summarised, single column, a primary submit button that is a real `<button>`.

## 9. Mobile and responsive

`<meta name="viewport">` present; no horizontal scrolling; touch targets ideally 44-48 px; primary actions in thumb reach; no hover-only interactions; form inputs at least 16 px font size (prevents iOS zoom).

## 10. Performance as experience

Core Web Vitals "good": LCP at most 2.5 s, INP at most 200 ms, CLS at most 0.1 (lab proxy for INP: TBT at most 200 ms). Reserve space for images and late content, show skeletons or progress for waits over 1 s, never shift content the user is about to tap.

## 11. Deceptive patterns (deceptive.design taxonomy; EU DSA Art. 25, UWG/UCPD)

Confirmshaming, fake urgency or scarcity (countdowns that reset), preselected consent or add-ons, hidden costs, sneaking into basket, obstruction (hard to cancel), nagging, trick wording, disguised ads, forced action or registration, visual interference that steers to the worse option. Any instance is category `deceptive-pattern`, severity at least 3.

## 12. Trust and credibility

Who is behind the site (contact, imprint where legally required, e.g. Impressum in DACH), transparent prices, privacy information, social proof that is verifiable, no broken or placeholder content.
