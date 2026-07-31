---
'@guideflow/core': minor
'@guideflow/react': patch
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

**Fixed: React had the same bug, plus one of its own.** `useTour().isPaused` came from a mirror
inside the `useSyncExternalStore` store, seeded `false` for the same reason. That store's engine
subscription is also ref-counted, and unmounting the last consumer both reset the mirror and
stopped observing `tour:pause` / `tour:resume` — so a component remounting into a tour that was
still paused reported it as running, even though an earlier consumer had seen the pause. The
snapshot now reads `gf.isPaused` directly and keeps no mirror, so it cannot drift.
