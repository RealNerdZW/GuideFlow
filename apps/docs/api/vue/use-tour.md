---
description: "useTour() Vue composable API reference — reactive tour state and the full GuideFlow control surface for @guideflow/vue."
keywords: useTour, Vue composable, GuideFlow Vue, @guideflow/vue
---

# useTour()

Vue 3 composable that projects the tour state of the `GuideFlowInstance` provided by
[`GuideFlowPlugin`](./guide-flow-plugin) onto reactive refs, and forwards the whole control
surface — navigation, pause/resume, flows, hotspots, hints and i18n.

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

| Property           | Type                                 | Description |
|--------------------|--------------------------------------|-------------|
| `isActive`         | `Readonly<Ref<boolean>>`             | Whether a tour is currently active |
| `isPaused`         | `Readonly<Ref<boolean>>`             | Whether the active tour is paused |
| `currentStepId`    | `Readonly<Ref<string \| null>>`      | ID of the current step |
| `currentStepIndex` | `Readonly<Ref<number>>`              | Zero-based index of the current step within the active state |
| `totalSteps`       | `Readonly<Ref<number>>`              | Number of steps in the active flow state |
| `currentStep`      | `Readonly<Ref<Step \| null>>`        | The step object on screen — the same object as `instance.currentStep` |
| `currentContent`   | `Readonly<Ref<StepContent \| null>>` | Its resolved content, with any async `content` already awaited |
| `locale`           | `Readonly<Ref<string>>`              | Active i18n locale — see [`setLocale()`](#i18n-and-progress) |

The scalar refs are `readonly()` refs; `currentStep` and `currentContent` are computed refs.
Either way, writing to `.value` is a no-op and logs a Vue warning.

`currentStep` is deliberately **not** wrapped in `readonly()`: that would hand back a deep
readonly proxy, wrapping the step's own `showIf` and action callbacks. You get the raw object.

::: tip Values reset when a tour ends
On `tour:complete` and `tour:abandon` every field returns to its idle value — `isActive` and
`isPaused` to `false`, `currentStepId`/`currentStep`/`currentContent` to `null`,
`currentStepIndex` and `totalSteps` to `0`. Before v0.2.0 they latched the last rendered step,
so progress indicators stayed stuck on "2 of 2".
:::

### Navigation

| Method   | Signature                                                                      | Description |
|----------|--------------------------------------------------------------------------------|-------------|
| `start`  | `(flow?: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start a tour. Falls back to the `flowId` passed to the composable; resolves to a no-op if neither is available. |
| `next`   | `() => Promise<void>`                                                          | Advance to the next step |
| `prev`   | `() => Promise<void>`                                                          | Go to the previous step |
| `goTo`   | `(stepId: string) => Promise<void>`                                            | Jump to a step by ID |
| `send`   | `(event: string) => Promise<void>`                                             | Send a state machine event |
| `stop`   | `() => void`                                                                   | End the active tour programmatically |
| `pause`  | `() => void`                                                                   | Hide the tour UI without abandoning the flow |
| `resume` | `() => void`                                                                   | Re-show a paused tour at the step it was paused on |
| `skip`   | `() => void`                                                                   | Dismiss the tour the way a user would — emits `step:skip`, `tour:dismiss`, then `tour:abandon` |

`stop()` and `skip()` both end the tour, but only `skip()` reports it as a *user* dismissal, so
only `skip()` triggers a flow's `persistDismissal` "don't show again" behaviour.

### Flows and configuration

| Method      | Signature                                              | Description |
|-------------|--------------------------------------------------------|-------------|
| `createFlow`| `(definition: FlowDefinition) => FlowDefinition`       | Register a flow so `start('id')` can resolve it |
| `listFlows` | `() => FlowDefinition[]`                               | Every flow registered on this instance |
| `configure` | `(patch: Partial<GuideFlowConfig>) => void`            | Patch the instance config after creation |

### Standalone UI

| Method          | Signature                                                        | Description |
|-----------------|------------------------------------------------------------------|-------------|
| `hotspot`       | `(target: string \| Element, options?: HotspotOptions) => string` | Add a persistent beacon; returns its id (`''` during SSR or when the target is not found) |
| `removeHotspot` | `(id: string) => void`                                           | Remove a beacon by id |
| `hints`         | `(steps: HintStep[]) => void`                                    | Register hint badges |
| `showHints`     | `() => void`                                                     | Show every registered hint badge |
| `hideHints`     | `() => void`                                                     | Hide them again |

For a hotspot whose lifetime should follow a component, prefer
[`useHotspot()`](./use-hotspot) — it removes the beacon on scope dispose for you.

::: warning Hints have no per-hint removal
Core's `HintSystem` can register and toggle hints, but only clears them wholesale when the
instance is destroyed. Register hints once, at app scope, rather than per component.
:::

### i18n and progress

| Property    | Type                             | Description |
|-------------|----------------------------------|-------------|
| `i18n`      | `I18nRegistry`                   | The instance's registry — `register()`, `use()`, `t()` |
| `progress`  | `ProgressStore`                  | The instance's persistence store |
| `setLocale` | `(locale: string) => void`       | Calls `i18n.use()` **and** updates the reactive `locale` ref |

Prefer `setLocale()` over `i18n.use()`: the registry emits no events, so a direct `use()` call
cannot update `locale`. Neither re-renders a popover that is already on screen — a locale
change applies to the next step rendered.

### instance

| Property   | Type                | Description |
|------------|---------------------|-------------|
| `instance` | `GuideFlowInstance` | The raw instance, for `on()` and anything not projected here. Identical to what [`useGuideFlow()`](./guide-flow-plugin#useguideflow) returns. |

### Cleanup

Every core event listener is released via `onScopeDispose()`, so they are cleaned up when the
owning component unmounts **and** when a bare `effectScope()` — a Pinia store, or a shared
composable — is stopped.

## Example

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'
import type { FlowDefinition } from '@guideflow/vue'

const { start, stop, next, prev, pause, resume, isActive, isPaused, currentStepIndex, totalSteps } =
  useTour()

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
    <button v-if="!isPaused" @click="pause()">Pause</button>
    <button v-else @click="resume()">Resume</button>
    <button @click="stop()">Close</button>
  </div>
</template>
```

Destructured refs are unwrapped automatically in the template by `<script setup>`. If you keep
the object instead — `const tour = useTour()` — the template must read `tour.isActive.value`,
because nested refs on a plain object are not unwrapped.

## Rendering your own popover

`currentStep` and `currentContent` are enough to draw a popover yourself. They update on
`step:enter`, so they are always in step with core's own renderer.

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

const { isActive, isPaused, currentContent, next, prev } = useTour()
</script>

<template>
  <aside v-if="isActive && !isPaused && currentContent" role="dialog">
    <h2>{{ currentContent.title }}</h2>
    <p>{{ currentContent.body }}</p>
    <button @click="prev()">Back</button>
    <button @click="next()">Next</button>
  </aside>
</template>
```

To render *only* your own popover, pass a custom `renderer` implementing `RendererContract`
when the instance is created — core's `DefaultRenderer` will otherwise draw one too.

## With a default flow ID

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

// Calls gf.start('onboarding') when start() is invoked with no arguments.
// The id must have been registered via createFlow(definition).
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
- [useHotspot()](./use-hotspot) — scope-bound hotspot beacons
- [Vue guide](/guide/vue)
