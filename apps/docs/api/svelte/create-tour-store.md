---
description: "createTourStore() API reference — Svelte store-based tour control for @guideflow/svelte."
keywords: createTourStore, GuideFlow Svelte, Svelte store, @guideflow/svelte
---

# createTourStore()

`createTourStore()` is the entire public API of `@guideflow/svelte`. It wraps a GuideFlow
instance and projects its state onto individual `Readable` Svelte stores.

The package ships **no components**. You render your own markup and drive it from the store,
or let `@guideflow/core`'s default renderer draw the popover for you.

## Signature

```ts
import { createTourStore } from '@guideflow/svelte'

function createTourStore(
  configOrInstance?: GuideFlowConfig | GuideFlowInstance
): TourStore
```

### Parameters

| Parameter          | Type                                   | Description |
|--------------------|----------------------------------------|-------------|
| `configOrInstance` | `GuideFlowConfig \| GuideFlowInstance` | Optional. A [`GuideFlowConfig`](../create-guide-flow) creates a new instance internally; an existing `GuideFlowInstance` is adopted as-is. Omitting it creates an instance with default config. |

## TourStore

### Readable state

Each of these is a separate Svelte store — not a field on one store.

| Property           | Type                       | Description |
|--------------------|----------------------------|-------------|
| `isActive`         | `Readable<boolean>`        | Whether a tour is currently active |
| `currentStepId`    | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>`         | Zero-based index of the current step within the active state |
| `totalSteps`       | `Readable<number>`         | Number of steps in the active flow state |

They are read-only projections: `set` and `update` are deliberately not exposed, so a
component cannot lie to the engine.

### Methods

| Method    | Signature                                                                     | Description |
|-----------|-------------------------------------------------------------------------------|-------------|
| `start`   | `(flow: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start a flow definition, or a flow id previously registered with `instance.createFlow()` |
| `next`    | `() => Promise<void>`                                                         | Advance to the next step |
| `prev`    | `() => Promise<void>`                                                         | Go to the previous step |
| `goTo`    | `(stepId: string) => Promise<void>`                                           | Jump to a step by ID |
| `send`    | `(event: string) => Promise<void>`                                            | Send a state machine event |
| `stop`    | `() => void`                                                                  | End the active tour |
| `destroy` | `() => void`                                                                  | Detach listeners **and destroy the underlying instance** — see [Cleanup](#cleanup) |

### `instance`

| Property   | Type                | Description |
|------------|---------------------|-------------|
| `instance` | `GuideFlowInstance` | The underlying GuideFlow instance. Anything the store does not project — `hotspot()`, `hints()`, `pause()`, `i18n`, `progress`, `on()` — is reached through here. |

## Using the stores in a component

Svelte's `$` auto-subscription applies to an **identifier that is itself a store**. `tour` is a
plain object, so `$tour.isActive` is a compile error. Destructure the fields you need first:

```svelte
<script>
  import { createTourStore } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const tour = createTourStore({ debug: true })
  const { isActive, currentStepIndex, totalSteps } = tour

  const flow = {
    id: 'onboarding',
    initial: 'main',
    states: {
      main: {
        steps: [
          { id: 'step-1', target: '#hero', content: { title: 'Welcome', body: 'Start here.' } },
          { id: 'step-2', target: '#nav', content: { title: 'Navigate', body: 'Everything lives here.' } },
        ],
        final: true,
      },
    },
  }
</script>

<button on:click={() => tour.start(flow)}>Start Tour</button>

{#if $isActive}
  <p>Step {$currentStepIndex + 1} of {$totalSteps}</p>
  <button on:click={() => tour.prev()}>Back</button>
  <button on:click={() => tour.next()}>Next</button>
  <button on:click={() => tour.stop()}>Close</button>
{/if}
```

::: warning Values do not reset when a tour ends
`isActive` flips back to `false`, but `currentStepId`, `currentStepIndex` and `totalSteps`
keep the values they held on the last rendered step. Gate any progress indicator on
`$isActive` rather than assuming the counters return to zero.
:::

## Wrapping an existing instance

```svelte
<script>
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'

  const gf = createGuideFlow({ context: { userId: 'u_123' } })
  const tour = createTourStore(gf)
</script>
```

The store stays in sync even when the instance is driven directly (`gf.next()`), because it
subscribes to core's `tour:start`, `tour:complete`, `tour:abandon`, `step:enter` and
`step:exit` events.

## Cleanup

`destroy()` removes the store's event subscriptions **and calls `instance.destroy()`**. That
is fine for a store the component owns:

```svelte
<script>
  import { onDestroy } from 'svelte'
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  onDestroy(() => tour.destroy())
</script>
```

But if you passed in an instance that the rest of the app shares, `destroy()` will tear that
shared instance down too. In that case create the instance at app scope and do not call
`tour.destroy()` from a component.

## See also

- [Svelte guide](/guide/svelte)
- [createGuideFlow()](../create-guide-flow)
- [FlowDefinition](../flow-definition)
