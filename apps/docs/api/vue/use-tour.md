---
description: "useTour() Vue composable API reference — reactive tour state and controls for @guideflow/vue."
keywords: useTour, Vue composable, GuideFlow Vue, @guideflow/vue
---

# useTour()

Vue 3 composable that provides reactive tour state and control methods. Internally syncs with the `GuideFlowInstance` provided by [`GuideFlowPlugin`](./guide-flow-plugin).

## Signature

```ts
import { useTour } from '@guideflow/vue'

function useTour(flowId?: string): UseTourReturn
```

| Parameter | Type     | Description |
|-----------|----------|-------------|
| `flowId`  | `string` | Optional default flow ID to use when `start()` is called without arguments |

## Return Value

### Reactive State (`Readonly<Ref<…>>`)

| Property           | Type                          | Description |
|--------------------|-------------------------------|-------------|
| `isActive`         | `Readonly<Ref<boolean>>`      | Whether a tour is currently active |
| `currentStepId`    | `Readonly<Ref<string \| null>>` | ID of the current step |
| `currentStepIndex` | `Readonly<Ref<number>>`       | Zero-based index of the current step |
| `totalSteps`       | `Readonly<Ref<number>>`       | Total steps in the active flow |

### Methods

| Method  | Signature                                                              | Description |
|---------|------------------------------------------------------------------------|-------------|
| `start` | `(flow?: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start a tour. Falls back to the `flowId` passed to the composable. |
| `next`  | `() => Promise<void>`                                                  | Advance to the next step |
| `prev`  | `() => Promise<void>`                                                  | Go to the previous step |
| `goTo`  | `(stepId: string) => Promise<void>`                                    | Jump to a step by ID |
| `send`  | `(event: string) => Promise<void>`                                     | Send a state machine event |
| `stop`  | `() => void`                                                           | End the active tour |

Event listeners are automatically cleaned up via `onUnmounted`.

## Example

```vue
<script setup>
import { useTour } from '@guideflow/vue'
import onboardingFlow from './flows/onboarding'

const tour = useTour()
</script>

<template>
  <button @click="tour.start(onboardingFlow)">Start Tour</button>

  <div v-if="tour.isActive.value">
    <span>Step {{ tour.currentStepIndex.value + 1 }} of {{ tour.totalSteps.value }}</span>
    <button @click="tour.prev()">Back</button>
    <button @click="tour.next()">Next</button>
    <button @click="tour.stop()">Close</button>
  </div>
</template>
```

## With a Default Flow ID

```vue
<script setup>
import { useTour } from '@guideflow/vue'

// Will call gf.start('onboarding') when tour.start() is called with no args
const tour = useTour('onboarding')
</script>

<template>
  <button @click="tour.start()">Start Onboarding</button>
</template>
```

## Requirements

Must be used inside a component tree where [`GuideFlowPlugin`](./guide-flow-plugin) is installed.

## See Also

- [GuideFlowPlugin](./guide-flow-plugin) — plugin installation and configuration
