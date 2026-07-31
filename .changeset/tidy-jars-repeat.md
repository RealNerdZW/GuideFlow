---
'@guideflow/core': minor
---

Fix seven defects that made documented behaviour fail.

**Final states now render their steps.** `next()` and `send()` checked `isFinal`
immediately after transitioning, so entering a state marked `final: true` ended
the tour without ever showing that state's steps. The README quick-start
displayed 1 of its 2 steps. A tour now completes when there is nothing left to
render, not when it enters a final state.

**Popover positioning works on scrolled pages.** `getViewportRect()` returned
page coordinates while target rects are client-relative, so every fit test
failed once the page was scrolled and the popover fell back to a clamped centre.
It now returns client coordinates, matching `getBoundingClientRect()` and
`position: fixed`. **Breaking if you called `getViewportRect()` directly** — use
`getAbsoluteRect()` for page-coordinate maths. The popover also repositions on
scroll and resize instead of drifting away from its target.

**Persistence works end to end.** Resuming now re-renders onto the saved step
instead of leaving the UI on step 0; completed tours are suppressed instead of
replaying forever; progress is saved on `start()` and on abandon, not only after
`next()`; cross-tab `BroadcastChannel` sync is created once per instance rather
than only on the resume path (and ignores snapshots from other flows);
`ttl: 0` means "never expires" as documented instead of expiring everything
instantly; and a restored `stepIndex` is clamped, so tampered or stale storage
can no longer leave an active tour with nothing to render.

**Navigation crosses state boundaries.** `goTo(stepId)` finds steps in any
state, and `prev()` steps back into the previous state instead of silently doing
nothing. `prev()` at the very first step is now a no-op rather than re-emitting
`step:enter` for the step already on screen. `showIf` is evaluated in the
direction of travel, so Back no longer bounces forward past a hidden step. A
transition naming a state that does not exist is rejected with a warning instead
of leaving the machine frozen.

**Per-instance i18n reaches the UI.** `DefaultRenderer` read the module-level
`defaultI18n` singleton, so `gf.i18n.use('fr')` had no effect on rendered
strings. Interpolation also replaces every occurrence of a token, not just the
first.

**Options that did nothing now work.** `clickThrough` actually lets clicks
through (an inline `pointer-events` style was overriding the class);
`overlayColor` and `animated` are honoured; per-step `padding` no longer leaks
into subsequent steps; `configure()` applies `spotlight`, `context`, `debug` and
`persistence` to the running instance instead of only `nonce`; and a custom
`RendererContract` now receives `onInit`, `setI18n` and `setActionHandler` —
previously all three ran only for the built-in renderer.

**Attribute (Intro.js compat) tours work.** `scanAttributeTour` emitted one
state per step, so every step reported "1 of 1": no Back button, no progress
bar, and a Done button that ended the tour on step 1. All steps now live in one
state. `watchAttributeTour` no longer re-triggers on GuideFlow's own DOM
insertions, which restarted the tour in a loop.

**New API.** `FlowDefinition.persistDismissal` opts a flow into "don't show
again" (off by default); the `tour:dismiss` event distinguishes a user dismissal
from a programmatic `stop()`; `skip()` is now declared on `GuideFlowInstance`
(it was always reachable at runtime but missing from the type).

The `@guideflow/core` size budget moves from 12 kB to 12.5 kB gzip to
accommodate these fixes (measured: 12.13 kB).
