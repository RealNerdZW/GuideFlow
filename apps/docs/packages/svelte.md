---
description: "@guideflow/svelte — a reactive Svelte store for GuideFlow product tours. Supports Svelte 4 and Svelte 5 through createTourStore()."
keywords: "@guideflow/svelte, Svelte product tour, Svelte 5 onboarding, GuideFlow Svelte store"
---

# @guideflow/svelte

**A reactive Svelte store for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/svelte.svg)](https://www.npmjs.com/package/@guideflow/svelte)

A thin adapter over [`@guideflow/core`](./core). It ships **no Svelte components** — the tour UI
is drawn by core's renderer.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

## Exports

`createTourStore()` and the `TourStore` type are the complete public surface. Core types are
re-exported for convenience: `FlowDefinition`, `Step`, `StepContent`, `GuidanceContext`,
`HotspotOptions`, `HintStep`, `GuideFlowConfig`, `GuideFlowInstance`, `PopoverPlacement`.

```ts
createTourStore(configOrInstance?: GuideFlowConfig | GuideFlowInstance): TourStore
```

### TourStore

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | `Readable<boolean>` | Whether a tour is currently running |
| `currentStepId` | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>` | Zero-based index of the current step |
| `totalSteps` | `Readable<number>` | Steps in the active flow state |
| `start(flow, context?)` | `Promise<void>` | Start a flow definition or a registered flow id |
| `next()` | `Promise<void>` | Advance to the next step |
| `prev()` | `Promise<void>` | Go to the previous step |
| `goTo(stepId)` | `Promise<void>` | Jump to a step by ID |
| `send(event)` | `Promise<void>` | Send a state machine event |
| `stop()` | `void` | Stop the active tour |
| `destroy()` | `void` | Detach listeners and destroy the underlying instance |
| `instance` | `GuideFlowInstance` | The wrapped GuideFlow instance |

Each state field is a separate store, so `$tour.isActive` does not compile — destructure first
and write `$isActive`. See the [Svelte guide](/guide/svelte).

## Peer dependencies

- `svelte` ^4.0.0 || ^5.0.0

## Links

- [npm](https://www.npmjs.com/package/@guideflow/svelte)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/svelte)
- [Svelte guide](/guide/svelte)
- [createTourStore() API](/api/svelte/create-tour-store)
