---
"@guideflow/core": minor
---

**`gf.repaint()` — re-resolve what a step says without re-announcing which step it is.**

`rerender()` re-emits `step:enter`, which `@guideflow/analytics` counts as another step view. So the
documented way to move a live step into another language — `i18n.use('es')` then `rerender()` —
inflated that step's `reached` count in `computeFunnel`. Three toggles produced four views.

```ts
gf.i18n.use('es')
await gf.repaint()          // translated, and no phantom step view
```

It also covers the other half of the same problem: `configure({ context })` mid-tour changes what
`{{token}}` values resolve to, and previously the only way to show that was a `rerender()`.

No machine movement, no `showIf`, no target re-resolution, no events. It defers to a navigation
already in flight rather than cancelling it, and a translation that throws will not end the tour.

Seventh size raise, 15.5 → 16 kB, measured **15.54** (ADR-026). An 810 B saving is available by
moving `HotspotManager` off the default entry — real, measured, and deliberately not taken here:
it is a breaking API change and deserves its own decision rather than being spent to fund an 80 B
method.
