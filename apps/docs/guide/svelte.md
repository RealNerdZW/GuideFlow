---
description: Add GuideFlow product tours to a Svelte 4 or Svelte 5 app. Install @guideflow/svelte and use createTourStore() — a reactive store-based API for guided user onboarding.
keywords: GuideFlow Svelte, Svelte product tour, Svelte 5 onboarding, @guideflow/svelte store
---

# Svelte

`@guideflow/svelte` exposes `createTourStore()`, which projects a
[`@guideflow/core`](/packages/core) instance onto Svelte readable stores and forwards the whole
control surface, plus a `hotspotAction` `use:` directive. It supports Svelte 4 and Svelte 5.

The package ships **no components**. Core's renderer draws the spotlight and popover; the store
exists so your own markup can react to tour state.

## Installation

```bash
npm install @guideflow/core @guideflow/svelte
```

The package is **ESM only** — Svelte itself is, so a `require()` entry point could never have
worked. See [Module format](/api/svelte/create-tour-store#module-format).

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
| `isPaused` | `Readable<boolean>` | Whether the active tour is paused |
| `currentStepId` | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>` | Zero-based index of the current step |
| `totalSteps` | `Readable<number>` | Steps in the active flow state |
| `currentStep` | `Readable<Step \| null>` | The live step object |
| `currentContent` | `Readable<StepContent \| null>` | Its resolved content |
| `locale` | `Readable<string>` | Active i18n locale |

### Methods

| Method | Description |
|--------|-------------|
| `start(flow, context?)` | Start a `FlowDefinition`, or a flow id registered via `createFlow()` |
| `next()` / `prev()` | Move between steps |
| `goTo(stepId)` | Jump to a step by ID |
| `send(event)` | Send a state machine event |
| `stop()` | Stop the active tour programmatically |
| `pause()` / `resume()` | Hide and re-show the UI without abandoning the flow |
| `skip()` | Dismiss the tour as the user would — emits `step:skip`, `tour:dismiss`, `tour:abandon` |
| `createFlow(def)` / `listFlows()` | Register and read the instance's flow registry |
| `configure(patch)` | Patch the instance config |
| `hotspot()` / `removeHotspot()` | Standalone beacons |
| `hints()` / `showHints()` / `hideHints()` | Hint badges |
| `i18n` / `progress` | The instance's registry and progress store |
| `setLocale(locale)` | Switch locale and update the `locale` store |
| `instance` / `ownsInstance` | The raw instance, and whether the store created it |
| `destroy()` | Detach listeners; destroy the instance **only if the store owns it** |

::: tip Values reset when a tour ends
Every store returns to its idle value on `tour:complete` / `tour:abandon` — `$isActive` and
`$isPaused` to `false`, the step stores to `null` / `0`. Before v0.2.0 they retained the last
rendered step and a progress indicator stayed stuck on "2 of 2".
:::

## Pause, resume and skip

```svelte
<script>
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  const { isActive, isPaused } = tour
</script>

{#if $isActive}
  {#if $isPaused}
    <button on:click={() => tour.resume()}>Resume tour</button>
  {:else}
    <button on:click={() => tour.pause()}>Pause tour</button>
  {/if}
  <button on:click={() => tour.skip()}>No thanks</button>
{/if}
```

## Rendering your own popover

```svelte
<script>
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  const { isActive, isPaused, currentContent } = tour
</script>

{#if $isActive && !$isPaused && $currentContent}
  <aside role="dialog">
    <h2>{$currentContent.title}</h2>
    <p>{$currentContent.body}</p>
    <button on:click={() => tour.next()}>Next</button>
  </aside>
{/if}
```

Pass a custom `renderer` implementing `RendererContract` when creating the instance if you want
*only* your own popover — core's `DefaultRenderer` will otherwise draw one too.

## hotspotAction

A `use:` directive that ties a beacon to the node it is applied to:

```svelte
<script>
  import { createTourStore, hotspotAction } from '@guideflow/svelte'

  const tour = createTourStore()
  const hotspot = hotspotAction(tour.instance)
</script>

<button use:hotspot={{ title: 'New', body: 'Export now supports CSV.' }}>Export</button>
```

The beacon is removed when the node is destroyed, and replaced when the options change.

## Access the instance

The store also exposes the underlying GuideFlow instance, mainly for events:

```svelte
<script lang="ts">
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()

  tour.instance.on('tour:complete', ({ flowId }) => console.warn('Done!', flowId))
  tour.instance.on('hotspot:open', ({ id }) => console.warn('beacon clicked', id))
</script>
```

## Cleanup

`destroy()` always removes the store's core subscriptions. It destroys the underlying instance
**only when the store created it** (`tour.ownsInstance === true`):

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  onDestroy(() => tour.destroy())
</script>
```

An instance you passed in is yours — the store leaves it, and every listener you registered on
it, running. Before v0.2.0 `destroy()` tore it down regardless.

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
