---
'@guideflow/core': minor
'@guideflow/vue': patch
'@guideflow/svelte': patch
---

**`@guideflow/core` exposes `isPaused`.** `TourEngine` kept `_paused` private and offered no way
to read it, so a consumer holding a `GuideFlowInstance` could call `pause()` and `resume()` but
never ask whether a tour was paused. `isPaused` is now a getter on `TourEngine` and a `readonly`
field on the `GuideFlowInstance` interface, alongside `isActive`. It reports `false` once the tour
ends, so a paused tour that is stopped does not leave a stale `true` behind.

**Fixed: Vue and Svelte reported an already-paused tour as running.** Both adapters derived
paused-ness purely from core's `tour:pause` / `tour:resume` events and seeded their state with a
literal `false`, because there was nothing to read. A `useTour()` mounted — or a
`createTourStore(gf)` created — while a tour was already paused therefore started out claiming the
tour was running, and stayed wrong until the next pause or resume. Both now seed from
`gf.isPaused` and read the getter in their pause/resume handlers.
