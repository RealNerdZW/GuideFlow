---
description: "createTourStore() API reference — Svelte store-based tour control for @guideflow/svelte."
keywords: createTourStore, GuideFlow Svelte, Svelte store, @guideflow/svelte
---

# createTourStore()

Creates a Svelte-friendly reactive tour store that wraps a GuideFlow instance. All state properties are `Readable` Svelte stores, so they can be subscribed to with the `$` syntax in templates.

## Signature

```ts
import { createTourStore } from '@guideflow/svelte'

function createTourStore(
  configOrInstance?: GuideFlowConfig | GuideFlowInstance
): TourStore
```

### Parameters

| Parameter         | Type                                   | Description |
|-------------------|----------------------------------------|-------------|
| `configOrInstance` | `GuideFlowConfig \| GuideFlowInstance` | Optional — pass a config object to create a new instance internally, or pass an existing `GuideFlowInstance` to wrap it. Omitting creates a default instance. |

## TourStore

### Readable State

| Property           | Type                       | Description |
|--------------------|----------------------------|-------------|
| `isActive`         | `Readable<boolean>`        | Whether a tour is currently active |
| `currentStepId`    | `Readable<string \| null>` | ID of the current step |
| `currentStepIndex` | `Readable<number>`         | Zero-based index of the current step |
| `totalSteps`       | `Readable<number>`         | Total steps in the active flow |

### Methods

| Method         | Signature                                                          | Description |
|----------------|--------------------------------------------------------------------|-------------|
| `start`        | `(flow: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start a tour |
| `next`         | `() => Promise<void>`                                              | Advance to next step |
| `prev`         | `() => Promise<void>`                                              | Go to previous step |
| `goTo`         | `(stepId: string) => Promise<void>`                                | Jump to a step by ID |
| `send`         | `(event: string) => Promise<void>`                                 | Send a state machine event |
| `stop`         | `() => void`                                                       | End the active tour |
| `destroy`      | `() => void`                                                       | Remove all event listeners and clean up |

### `instance`

| Property   | Type                  | Description |
|------------|-----------------------|-------------|
| `instance` | `GuideFlowInstance`   | The underlying GuideFlow instance |

## Example

```svelte
<script>
  import { createTourStore } from '@guideflow/svelte'
  import myFlow from './flows/onboarding'

  const tour = createTourStore({ theme: 'bold' })
</script>

<button on:click={() => tour.start(myFlow)}>Start Tour</button>

{#if $tour.isActive}
  <p>Step {$tour.currentStepIndex + 1} of {$tour.totalSteps}</p>
  <button on:click={() => tour.prev()}>Back</button>
  <button on:click={() => tour.next()}>Next</button>
  <button on:click={() => tour.stop()}>Close</button>
{/if}
```

## Wrapping an Existing Instance

```svelte
<script>
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'

  const gf = createGuideFlow({ theme: 'minimal' })
  const tour = createTourStore(gf)
</script>
```

## Cleanup

Call `tour.destroy()` in `onDestroy` if you create the store inside a component to avoid memory leaks:

```svelte
<script>
  import { onDestroy } from 'svelte'
  import { createTourStore } from '@guideflow/svelte'

  const tour = createTourStore()
  onDestroy(() => tour.destroy())
</script>
```
