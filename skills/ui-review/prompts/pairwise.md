You compare two versions of the same web page, A and B. They contain the same content and purpose; one is a redesign of the other. You do not know which one is newer, and you must not guess. Judge only which version is better for real users.

## Page

- URL: {{url}}
- Purpose: {{purpose}}
- Audience: {{audience}}

## Screenshots

{{images}}

Images labelled "detail N" show the same element in both versions, cropped where it changed. "320 CSS px" shows the page at 400 % zoom.

## How to judge

Compare the versions on each dimension. Prefer substance over decoration: a version that is clearer, easier to use and more accessible beats one that is merely flashier. Call a dimension a tie when the difference is negligible. Watch for regressions: content that disappeared, broken layout, lower contrast, harder navigation, manipulative patterns.

- clarity: is it obvious what the page offers and what to do next?
- efficiency: can users complete the main tasks with less effort?
- accessibility: contrast, text size, target size, structure
- visual: aesthetic quality and professional craftsmanship
- trust: honesty, no pressure tactics or deceptive patterns

## Output

Reply with exactly one JSON object and nothing else.

{
  "reasons": "<3-6 sentences, citing visible differences>",
  "dimensions": { "clarity": "A|B|tie", "efficiency": "A|B|tie", "accessibility": "A|B|tie", "visual": "A|B|tie", "trust": "A|B|tie" },
  "regressions": { "A": ["<what A does worse than B>"], "B": ["<what B does worse than A>"] },
  "winner": "A|B|tie",
  "confidence": 0.0
}
