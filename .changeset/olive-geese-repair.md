---
'@guideflow/svelte': minor
'@guideflow/vue': minor
---

Close the adapter parity gaps: Vue and Svelte now reach the whole `GuideFlowInstance` surface.

**`pause`, `resume` and `skip` are reachable from an adapter for the first time.** They have
existed on the core instance for a while but no adapter forwarded them, so a Vue or Svelte app
could not pause a tour without reaching for the raw instance. Both adapters also expose a
reactive `isPaused` (Vue: a ref, Svelte: a store), tracking core's `tour:pause` / `tour:resume`
events.

**The rest of the surface follows.** `currentStep`, `currentContent`, `createFlow`, `listFlows`,
`configure`, `hotspot`, `removeHotspot`, `hints`, `showHints`, `hideHints`, `i18n`, `progress`
and the raw `instance` are now on `useTour()` and `TourStore`, plus a reactive `locale` with a
`setLocale()` that keeps it in sync (the i18n registry emits no events, so calling `i18n.use()`
directly still bypasses the ref/store).

**New: scope-bound hotspots, idiomatic per framework.** Vue gains `useHotspot(target, options?)`,
which accepts a template ref or a selector and removes the beacon on `onScopeDispose`. Svelte
gains `hotspotAction(instance)`, a `use:` directive whose beacon lives exactly as long as the
node it is applied to. Neither package ships components — Svelte components would need
`svelte-package`, which `tsup` cannot do.

**Fixed: step state was stale after a tour ended.** Core emits `tour:complete` / `tour:abandon`
from inside `_doEnd()`, *before* it nulls the machine, so both adapters latched the last live
step and a progress indicator stayed on "2 of 2" for the rest of the page's life. Both now reset
to the idle values on those events.

**Fixed: `TourStore.destroy()` tore down an instance it did not create.** `createTourStore(gf)`
adopts an instance the caller owns, but `destroy()` called `gf.destroy()` regardless — so
disposing one component's store killed a shared instance along with every listener the host had
registered on it. `destroy()` now disposes the instance only when the store created it, and the
new `ownsInstance` boolean says which case you are in. Listener detachment is unchanged.

**Fixed: `this.$guideflow` was untyped.** `@guideflow/vue` now augments Vue's
`ComponentCustomProperties`, so Options API TypeScript users get `GuideFlowInstance` without
writing their own `.d.ts`.

**Breaking for CJS consumers of `@guideflow/svelte`: the package is now ESM only.** The `require`
entry point it advertised never worked — Svelte is ESM-only in both 4 and 5, so
`require('svelte/store')` threw `ERR_REQUIRE_ESM` on every Node in the declared `>=18` range
below 22.12. Rather than keep publishing a bundle that cannot load, `main` now points at the ESM
build and the `require` condition is gone. Import it from ESM, or from a bundler that resolves
the `import` condition.
