---
'@guideflow/survey': patch
'@guideflow/core': patch
---

Two announcement defects, found by auditing the real accessibility tree

Neither is visible to axe, which checks rules rather than output.

**The survey scale announced every value twice.** The visible number is a `<span>`
inside the `<label>`; the label named the radio *and* the span was exposed beside
it as its own text node, so an eleven-point NPS scale read as "0, 0, 1, 1, 2, 2"
all the way up. The input now carries an explicit `aria-label` and the visual
copy is `aria-hidden` — hiding the span alone would have left the radio with no
accessible name at all.

**A tour step announced doubled sentence punctuation.** `_announce` joins title,
body and step counter with `". "`, so a body already ending in a full stop
produced `"Step One. This is step one.. Step 1 of 3"`. Screen readers pause
oddly on it and some voice the stray mark. Trailing `.!?` is now stripped from
each part before the join.

Both are pinned by `apps/e2e/tests/a11y-announcements.spec.ts`, which captures
every live-region utterance in order across four browser projects.
