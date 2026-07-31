---
description: "useTour() Vue composable API reference — reactive tour state and controls for @guideflow/vue."
keywords: useTour, Vue composable, GuideFlow Vue, @guideflow/vue
---

# useTour()

Vue 3 composable that projects the tour state of the `GuideFlowInstance` provided by
[`GuideFlowPlugin`](./guide-flow-plugin) onto reactive refs, and forwards the control methods.

## Signature

```ts
import { useTour } from '@guideflow/vue'

function useTour(flowId?: string): UseTourReturn
```

| Parameter | Type     | Description |
|-----------|----------|-------------|
| `flowId`  | `string` | Optional default flow ID, used when `start()` is called with no arguments |

## UseTourReturn

### Reactive state

| Property           | Type                            | Description |
|--------------------|---------------------------------|-------------|
| `isActive`         | `Readonly<Ref<boolean>>`        | Whether a tour is currently active |
| `currentStepId`    | `Readonly<Ref<string \| null>>` | ID of the current step |
| `currentStepIndex` | `Readonly<Ref<number>>`         | Zero-based index of the current step within the active state |
| `totalSteps`       | `Readonly<Ref<number>>`         | Number of steps in the active flow state |

These are `readonly()` refs — writing to `.value` is a no-op and logs a Vue warning.

### Methods

| Method  | Signature                                                                      | Description |
|---------|--------------------------------------------------------------------------------|-------------|
| `start` | `(flow?: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start a tour. Falls back to the `flowId` passed to the composable; resolves to a no-op if neither is available. |
| `next`  | `() => Promise<void>`                                                          | Advance to the next step |
| `prev`  | `() => Promise<void>`                                                          | Go to the previous step |
| `goTo`  | `(stepId: string) => Promise<void>`                                            | Jump to a step by ID |
| `send`  | `(event: string) => Promise<void>`                                             | Send a state machine event |
| `stop`  | `() => void`                                                                   | End the active tour |

Anything not listed here — `hotspot()`, `hints()`, `pause()`, `i18n`, `progress`, `on()` — is
reached through [`useGuideFlow()`](./guide-flow-plugin#useguideflow).

### Cleanup

The five core event listeners are released via `onScopeDispose()`, so they are cleaned up when
the owning component unmounts **and** when a bare `effectScope()` — a Pinia store, or a shared
composable — is stopped.

## Example

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'
import type { FlowDefinition } from '@guideflow/vue'

const { start, stop, next, prev, isActive, currentStepIndex, totalSteps } = useTour()

const flow: FlowDefinition = {
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

<template>
  <button @click="start(flow)">Start Tour</button>

  <div v-if="isActive">
    <span>Step {{ currentStepIndex + 1 }} of {{ totalSteps }}</span>
    <button @click="prev()">Back</button>
    <button @click="next()">Next</button>
    <button @click="stop()">Close</button>
  </div>
</template>
```

Destructured refs are unwrapped automatically in the template by `<script setup>`. If you keep
the object instead — `const tour = useTour()` — the template must read `tour.isActive.value`,
because nested refs on a plain object are not unwrapped.

::: warning Values do not reset when a tour ends
`isActive` returns to `false`, but `currentStepId`, `currentStepIndex` and `totalSteps` keep
the values they held on the last rendered step. Gate progress indicators on `isActive`.
:::

## With a default flow ID

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

// Calls gf.start('onboarding') when start() is invoked with no arguments.
// The id must have been registered via instance.createFlow(definition).
const tour = useTour('onboarding')
</script>

<template>
  <button @click="tour.start()">Start Onboarding</button>
</template>
```

## Requirements

Must be called inside a component tree — or an effect scope — where
[`GuideFlowPlugin`](./guide-flow-plugin) is installed. Without it, the underlying
`useGuideFlow()` throws.

## See also

- [GuideFlowPlugin](./guide-flow-plugin) — plugin installation and configuration
- [Vue guide](/guide/vue)
