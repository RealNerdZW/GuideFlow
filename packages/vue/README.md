# @guideflow/vue

**Vue 3 plugin and composables for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/vue.svg)](https://www.npmjs.com/package/@guideflow/vue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Vue 3 adapter for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). It provides a plugin and
composables over `@guideflow/core`. `useTour()` projects the entire instance surface, so nothing
in core is out of reach from Vue.

It ships **no Vue components** — the spotlight and popover are rendered by core, or by your own
markup driven from `currentStep` / `currentContent`.

## Installation

```bash
npm install @guideflow/core @guideflow/vue
```

## Quick Start

### Plugin setup

```ts
// main.ts
import { createApp } from 'vue'
import { createGuideFlow } from '@guideflow/core'
import { GuideFlowPlugin } from '@guideflow/vue'
import '@guideflow/core/styles'
import App from './App.vue'

const gf = createGuideFlow()
const app = createApp(App)
app.use(GuideFlowPlugin, { instance: gf })
app.mount('#app')
```

`GuideFlowPluginOptions` extends `GuideFlowConfig`, so you can omit `instance` and pass config
fields (`debug`, `context`, `persistence`, `spotlight`, `nonce`, `injectStyles`, `renderer`)
directly instead.

### Using the composable

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'
import type { FlowDefinition } from '@guideflow/vue'

const { start, isActive, currentStepIndex, totalSteps } = useTour()

// A flow is a state machine. A flat `{ id, steps: [...] }` object is not valid.
// Mark the last state `final: true`: the tour completes either way, but `final`
// is what stops the walk that computes `totalSteps`.
const flow: FlowDefinition = {
  id: 'welcome',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'step-1',
          target: '#hero',
          content: { title: 'Welcome!', body: 'Let us show you around.' },
          placement: 'bottom',
        },
      ],
      final: true,
    },
  },
}
</script>

<template>
  <button @click="start(flow)">Start Tour</button>
  <span v-if="isActive">Step {{ currentStepIndex + 1 }} of {{ totalSteps }}</span>
</template>
```

## Exports

| Export | Description |
|--------|-------------|
| `GuideFlowPlugin` | Vue plugin — provides one `GuideFlowInstance` app-wide and sets a typed `$guideflow` |
| `useGuideFlow()` | Returns the injected instance; throws outside plugin scope |
| `useTour(flowId?)` | The full reactive control surface — see below |
| `useHotspot(target, options?)` | Beacon bound to a template ref or selector; removed on scope dispose |
| `GUIDEFLOW_KEY` | `InjectionKey<GuideFlowInstance>` for manual provide/inject |

### `useTour(flowId?)`

| Group | Members |
|-------|---------|
| Reactive state | `isActive`, `isPaused`, `currentStepId`, `currentStepIndex`, `totalSteps`, `currentStep`, `currentContent`, `locale` |
| Navigation | `start`, `next`, `prev`, `goTo`, `send`, `stop`, `pause`, `resume`, `skip` |
| Flows & config | `createFlow`, `listFlows`, `configure` |
| Standalone UI | `hotspot`, `removeHotspot`, `hints`, `showHints`, `hideHints` |
| Subsystems | `i18n`, `progress`, `setLocale`, `instance` |

Types: `GuideFlowPluginOptions`, `UseTourReturn`, `UseHotspotReturn`, `HotspotTarget`, plus core
types re-exported for convenience (`FlowDefinition`, `Step`, `StepContent`, `GuidanceContext`,
`HotspotOptions`, `HintStep`, `GuideFlowConfig`, `PopoverPlacement`, `GuideFlowInstance`).

### Notes

- **State resets when a tour ends.** On `tour:complete` / `tour:abandon` every field returns to
  its idle value, so a progress indicator does not stay stuck on the last step.
- **Cleanup uses `onScopeDispose()`**, so both composables are safe inside a component *and*
  inside a bare `effectScope()` (a Pinia store, a shared composable).
- **`this.$guideflow` is typed.** The package augments Vue's `ComponentCustomProperties`, so
  Options API components get `GuideFlowInstance` with no `.d.ts` of your own.
- **Nuxt / SSR**: core guards every DOM access and injects no styles on the server, so the
  plugin and composables are safe during SSR. Start tours from `onMounted`.

## Peer Dependencies

- `vue` ^3.0.0

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
