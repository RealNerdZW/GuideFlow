---
description: "@guideflow/svelte — a reactive Svelte store for GuideFlow product tours. Supports Svelte 4 and Svelte 5 through createTourStore()."
keywords: "@guideflow/svelte, Svelte product tour, Svelte 5 onboarding, GuideFlow Svelte store"
---

# @guideflow/svelte

**A reactive Svelte store for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/svelte.svg)](https://www.npmjs.com/package/@guideflow/svelte)

A thin adapter over [`@guideflow/core`](./core). It ships **no Svelte components** — the tour UI
is drawn by core's renderer, or by your own markup driven from the store.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

The package is **ESM only** — Svelte itself is, so the CJS entry point published up to v0.1.9
threw `ERR_REQUIRE_ESM` and has been removed.

## Exports

`createTourStore()`, `hotspotAction()`, and the `TourStore` / `HotspotAction` /
`HotspotActionResult` types are the complete public surface. Core types are re-exported for
convenience: `FlowDefinition`, `Step`, `StepContent`, `GuidanceContext`, `HotspotOptions`,
`HintStep`, `GuideFlowConfig`, `GuideFlowInstance`, `PopoverPlacement`.

```ts
createTourStore(configOrInstance?: GuideFlowConfig | GuideFlowInstance): TourStore
hotspotAction(gf: GuideFlowInstance): (node: Element, options?: HotspotOptions) => HotspotActionResult
```

### TourStore

| Group | Members |
|-------|---------|
| Readable stores | `isActive`, `isPaused`, `currentStepId`, `currentStepIndex`, `totalSteps`, `currentStep`, `currentContent`, `locale` |
| Navigation | `start`, `next`, `prev`, `goTo`, `send`, `stop`, `pause`, `resume`, `skip` |
| Flows & config | `createFlow`, `listFlows`, `configure` |
| Standalone UI | `hotspot`, `removeHotspot`, `hints`, `showHints`, `hideHints` |
| Subsystems | `i18n`, `progress`, `setLocale` |
| Lifecycle | `instance`, `ownsInstance`, `destroy` |

`destroy()` detaches the store's listeners, and destroys the instance only when the store
created it. Every state store returns to its idle value when a tour ends.

Each state field is a separate store, so `$tour.isActive` does not compile — destructure first
and write `$isActive`. See the [Svelte guide](/guide/svelte).

## Peer dependencies

- `svelte` ^4.0.0 || ^5.0.0

## Links

- [npm](https://www.npmjs.com/package/@guideflow/svelte)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/svelte)
- [Svelte guide](/guide/svelte)
- [createTourStore() API](/api/svelte/create-tour-store)
