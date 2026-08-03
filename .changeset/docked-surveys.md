---
'@guideflow/survey': minor
'@guideflow/core': patch
---

New package `@guideflow/survey` — NPS and CSAT as a docked card

7.8c was deferred with a reason that has since evaporated: "a survey without
somewhere to send the answers is a form that discards them, and the backend is
where they would live." ADR-014 decided there is no backend, and analytics has
always been host-wired — so the answers go to a callback, like every other event
in this library.

**Not a tour step type**, which is what `PRODUCT-ROADMAP.md` used to say. A
step-type survey inherits all four limits the docs record against the
`target: null` modal, and decisively it lands in the tour funnel: submitting
would emit `tour:complete`, so `@guideflow/analytics` would count every NPS
response as a completed tour and your abandonment rate would move whenever you
ran a survey. The roadmap line is corrected in the same change.

**One question shape.** `scale` with configurable bounds is NPS (`0..10`, the
default), CSAT (`1..5`) and a thumbs poll (`1..2`). The response carries a
`normalized` score in `0..1`, so a host can compare scales without knowing
either one's bounds. The follow-up appears *after* a score, so the first thing
anyone sees is one click rather than a form.

**The cooldown is measured from the ask, not the answer.** `cooldownMs: 90 days`
is what NPS means in practice. Someone who closed the card without answering has
also been asked, and re-asking them tomorrow is the behaviour people uninstall
over. Omitting it makes one ask final. Bumping `version` asks everyone again
immediately, overriding an unelapsed cooldown — a genuinely different question
should not wait out the old one's timer.

It deliberately does **not** reuse `@guideflow/core/targeting`'s cap record: that
is keyed by flow id under targeting's own suffix, so `targeting.resetCaps()`
would wipe survey cooldowns, and a survey is not a flow.

**A radiogroup of real radios**, labelled by the question — so arrow keys move
within the group, Tab treats it as one stop, and a screen reader announces
"3 of 11". A row of buttons would look identical and lose all three plus the
selected state. `role="region"`, no `aria-modal`, no focus trap.

**The third copy of the docked-surface helpers is now enforced rather than
promised.** `dock-drift.test.ts` extracts the body of `createLiveRegion` and
`setTourActive` from all three packages, normalises comments and whitespace, and
fails if they differ — plus asserts the two properties easy to "simplify"
wrongly in one copy: that the live region is clipped rather than `display: none`
(which would remove it from the accessibility tree and never speak), and that
every package refcounts its stylesheet. One test file instead of a shared
package. See ADR-018.

**`@guideflow/core`** gains one CSS custom property, `--gf-z-survey: 99994` —
below every other docked surface, because a survey is the least urgent thing on
the page. No JavaScript, no budget change.
