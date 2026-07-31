---
description: Add GuideFlow product tours to a Vue 3 app. Install @guideflow/vue, register the plugin, and use the useTour() and useGuideFlow() composables for reactive tour management.
keywords: GuideFlow Vue, Vue 3 product tour, Vue onboarding library, @guideflow/vue composable
---

# Vue 3

`@guideflow/vue` is a thin adapter over [`@guideflow/core`](/packages/core): a Vue plugin that
provides one `GuideFlowInstance` app-wide, and two composables for reading and driving it.

The package ships **no components**. The spotlight and popover are drawn by core's renderer;
your own markup only needs the state the composable exposes.

## Installation

```bash
npm install @guideflow/core @guideflow/vue
```

## Plugin setup

```ts
// main.ts
import { createApp } from 'vue'
import { createGuideFlow } from '@guideflow/core'
import { GuideFlowPlugin } from '@guideflow/vue'
import '@guideflow/core/styles'
import App from './App.vue'

const gf = createGuideFlow({ context: { userId: 'u_123' } })

const app = createApp(App)
app.use(GuideFlowPlugin, { instance: gf })
app.mount('#app')
```

You can also let the plugin build the instance — pass
[`GuideFlowConfig`](/api/create-guide-flow) fields directly and omit `instance`:

```ts
app.use(GuideFlowPlugin, { debug: true, injectStyles: true })
```

## useTour()

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'
import type { FlowDefinition } from '@guideflow/vue'

const { start, stop, next, prev, isActive, currentStepIndex, totalSteps } = useTour()

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

A flow is a **state machine**, not a step array — see [Flows and steps](/guide/flows-and-steps).
A flat `{ id, steps: [...] }` object is not a valid `FlowDefinition`. A flow with no
`final: true` state never completes.

## useGuideFlow()

Access the raw instance for everything `useTour()` does not project:

```vue
<script setup lang="ts">
import { useGuideFlow } from '@guideflow/vue'

const gf = useGuideFlow()

gf.hotspot('#new-feature', {
  title: 'New!',
  body: 'Check out this feature.',
})

gf.on('tour:complete', ({ flowId }) => {
  console.warn('finished', flowId)
})
</script>
```

`useGuideFlow()` throws if the plugin was never installed.

## Nuxt / SSR

Core guards every DOM access behind `isBrowser()` and injects no styles on the server, so
`createGuideFlow()` and `GuideFlowPlugin` are safe to evaluate during SSR. Starting a tour
still requires a browser — call `start()` from `onMounted` or a client-only plugin.

## API reference

### GuideFlowPlugin

`GuideFlowPluginOptions` extends [`GuideFlowConfig`](/api/create-guide-flow) with:

| Option | Type | Description |
|--------|------|-------------|
| `instance` | `GuideFlowInstance` | An existing instance to provide. When supplied, the other config fields are ignored. |

### useTour(flowId?)

| Return | Type | Description |
|--------|------|-------------|
| `isActive` | `Readonly<Ref<boolean>>` | Whether a tour is running |
| `currentStepId` | `Readonly<Ref<string \| null>>` | ID of the current step |
| `currentStepIndex` | `Readonly<Ref<number>>` | Zero-based step index |
| `totalSteps` | `Readonly<Ref<number>>` | Steps in the active flow state |
| `start(flow?, context?)` | `Promise<void>` | Start a flow; falls back to the `flowId` argument |
| `stop()` | `void` | Stop the active tour |
| `next()` | `Promise<void>` | Advance to the next step |
| `prev()` | `Promise<void>` | Go to the previous step |
| `goTo(stepId)` | `Promise<void>` | Jump to a step by ID |
| `send(event)` | `Promise<void>` | Send a state machine event |

Listeners are released on `onScopeDispose()`. Full details in the
[useTour() API reference](/api/vue/use-tour).

### useGuideFlow()

Returns the `GuideFlowInstance` provided by the plugin, or throws.

### GUIDEFLOW_KEY

The `InjectionKey<GuideFlowInstance>` used by the plugin, for manual `provide`/`inject`.
