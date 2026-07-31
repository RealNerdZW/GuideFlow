---
description: Add GuideFlow product tours to a Svelte 4 or Svelte 5 app. Install @guideflow/svelte and use createTourStore() — a reactive store-based API for guided user onboarding.
keywords: GuideFlow Svelte, Svelte product tour, Svelte 5 onboarding, @guideflow/svelte store
---

# Svelte

`@guideflow/svelte` exposes a single function, `createTourStore()`, which projects a
[`@guideflow/core`](/packages/core) instance onto Svelte readable stores. It supports Svelte 4
and Svelte 5.

The package ships **no components**. Core's renderer draws the spotlight and popover; the store
exists so your own markup can react to tour state.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

## Quick start

```svelte
<script lang="ts">
  import { createTourStore } from '@guideflow/svelte'
  import type { FlowDefinition } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const tour = createTourStore()

  // Destructure before using `$`: `tour` is a plain object, not a store, so
  // `$tour.isActive` does not compile.
  const { isActive, currentStepIndex, totalSteps } = tour

  const flow: FlowDefinition = {
    id: 'welcome',
    initial: 'main',
    states: {
      main: {
        steps: [
          {
            id: 'step-1',
            target: '#hero',
            content: { title: 'Hello!', body: 'Let us show you around.' },
            placement: 'bottom',
          },
          {
            id: 'step-2',
            target: '#nav',
            content: { title: 'Navigation', body: 'Everything lives in this bar.' },
          },
        ],
        final: true,
      },
    },
  }
</script>

<button on:click={() => tour.start(flow)}>Start Tour</button>

{#if $isActive}
  <span>Step {$currentStepIndex + 1} of {$totalSteps}</span>
  <button on:click={() => tour.prev()}>Back</button>
  <button on:click={() => tour.next()}>Next</button>
{/if}
```

A flow is a **state machine**, not a step array — see [Flows and steps](/guide/flows-and-steps).
A flat `{ id, steps: [...] }` object is not a valid `FlowDefinition`, and a flow with no
`final: true` state never completes.

## createTourStore API

```ts
createTourStore(configOrInstance?: GuideFlowConfig | GuideFlowInstance): TourStore
```

Pass a [`GuideFlowConfig`](/api/create-guide-flow) to have the store create its own instance,
pass an existing `GuideFlowInstance` to adopt one, or pass nothing for defaults.

### Reactive stores

Each field is its own `Readable` store, and they are read-only — `set`/`update` are not exposed.

| Store | Type | Description |
|-------|------|-------------|
| `isActive` | `Readable<boolean>` | Whether a tour is currently running |
| `currentStepId` | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>` | Zero-based index of the current step |
| `totalSteps` | `Readable<number>` | Steps in the active flow state |

### Methods

| Method | Description |
|--------|-------------|
| `start(flow, context?)` | Start a `FlowDefinition`, or a flow id registered via `instance.createFlow()` |
| `next()` | Advance to the next step |
| `prev()` | Go to the previous step |
| `goTo(stepId)` | Jump to a step by ID |
| `send(event)` | Send a state machine event |
| `stop()` | Stop the active tour |
| `destroy()` | Detach listeners **and destroy the underlying instance** |

::: warning Values do not reset when a tour ends
`isActive` flips back to `false`, but `currentStepId`, `currentStepIndex` and `totalSteps`
retain the values from the last rendered step. Gate progress indicators on `$isActive`.
:::

## Access the instance

The store also exposes the underlying GuideFlow instance for everything it does not project:

```svelte
<script lang="ts">
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore(createGuideFlow())
  const { instance } = tour

  instance.hotspot('#btn', { title: 'New!' })
  instance.on('tour:complete', ({ flowId }) => console.warn('Done!', flowId))
</script>
```

## Cleanup

`destroy()` removes the store's core subscriptions **and calls `instance.destroy()`** — it does
this even for an instance you passed in. Call it from `onDestroy` only when the component owns
the instance:

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  onDestroy(() => tour.destroy())
</script>
```

If the instance is shared across your app, create it at app scope and do not call
`tour.destroy()` from a component.

## SvelteKit

Core guards every DOM access, and injects no styles on the server, so `createTourStore()` is
safe to evaluate during SSR. Starting a tour still needs a browser — call `start()` from
`onMount` or behind a `browser` check. Import the styles in your root layout:

```svelte
<!-- +layout.svelte -->
<script>
  import '@guideflow/core/styles'
</script>
```

## See also

- [createTourStore() API reference](/api/svelte/create-tour-store)
- [Flows and steps](/guide/flows-and-steps)
