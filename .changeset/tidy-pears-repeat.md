---
"@guideflow/core": patch
---

Two render-lifecycle defects that only bite once a step can wait

**A detached target no longer blacks out the page.** `SpotlightOverlay._update()` branched on
`!this._currentTarget`, but a target removed mid-step — by a route change, a list re-render, a
closing modal — is still a non-null `Element`; it just returns a zero rect. The cutout collapsed to
0×0 while keeping `box-shadow: 0 0 0 9999px`, painting a fully black, click-blocking screen with no
way out. It now falls back to modal mode, exactly as a deliberate `target: null` step does.

**Every navigation now cancels the render it interrupts.** `_renderGeneration` was bumped by
`rerender`, `start`, `pause`, `resume` and the end path — but never by `next`, `prev`, `goTo` or
`send`. Two `next()` calls inside the 150 ms scroll settle (a double-click on Next, or keyboard
autorepeat) captured the *same* generation, so both passed every staleness check and whichever
resolved last won — not necessarily the newer one. A no-op navigation still does not bump, so it
cannot cancel a render that is legitimately in flight.

Neither is dramatic at a 150 ms settle. Both become serious the moment a step can wait seconds for a
route to arrive, which is why they are fixed before the SPA navigation work rather than during it.
