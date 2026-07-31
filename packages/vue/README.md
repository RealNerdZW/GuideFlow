# @guideflow/vue

**Vue 3 plugin and composables for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/vue.svg)](https://www.npmjs.com/package/@guideflow/vue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Vue 3 adapter for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). It provides a plugin and
two composables over `@guideflow/core`.

It ships **no Vue components** — the spotlight and popover are rendered by core.

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

// A flow is a state machine. A flat `{ id, steps: [...] }` object is not valid,
// and a flow with no `final: true` state never completes.
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
| `GuideFlowPlugin` | Vue plugin — provides one `GuideFlowInstance` app-wide and sets `$guideflow` |
| `useGuideFlow()` | Returns the injected instance; throws outside plugin scope |
| `useTour(flowId?)` | Reactive `isActive` / `currentStepId` / `currentStepIndex` / `totalSteps`, plus `start`, `next`, `prev`, `goTo`, `send`, `stop` |
| `GUIDEFLOW_KEY` | `InjectionKey<GuideFlowInstance>` for manual provide/inject |

Types: `GuideFlowPluginOptions`, `UseTourReturn`, plus core types re-exported for convenience
(`FlowDefinition`, `Step`, `StepContent`, `GuidanceContext`, `HotspotOptions`, `HintStep`,
`GuideFlowConfig`, `PopoverPlacement`, `GuideFlowInstance`).

`useTour()` releases its core listeners via `onScopeDispose()`, so it is safe inside a component
or a bare `effectScope()` (a Pinia store, a shared composable).

## Peer Dependencies

- `vue` ^3.0.0

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
