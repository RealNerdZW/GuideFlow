---
"@guideflow/core": minor
"@guideflow/react": minor
---

**`clickThrough` steps are reachable by keyboard.**

ADR-004 carved a `clip-path` hole in the overlay so one element stays live to the mouse. The
renderer meanwhile trapped `Tab` inside the popover and set `aria-modal="true"` on every step,
including those — so a step saying "click Save" was followable with a mouse and impossible with a
keyboard, and the accessibility guide was telling authors to make the target Tab-reachable when it
could not be. `advanceOn` turned that from a wart into a defect: a tour that advances *because* the
user acted strands anyone who cannot act.

On a `clickThrough` step the focus trap now widens to popover ∪ target, and `aria-modal` is dropped
because the page provably is not inert. The same hole, cut in the tab order. It is exactly one
element — everything else behind the overlay stays trapped.

Mirrored in `@guideflow/react`'s `GuidePopover`, which had both defects identically. A **function**
target is async and so keeps the popover-only trap, matching `DefaultRenderer`.

Five e2e cases cover it, including the negative — an ordinary step must keep `aria-modal` and the
tight trap. None of it is observable in happy-dom, where `offsetParent` is null for everything and
the trap has nothing to iterate.
