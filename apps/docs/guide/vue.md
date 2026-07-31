---
description: Add GuideFlow product tours to a Vue 3 app. Install @guideflow/vue, register the plugin, and use the useTour() and useGuideFlow() composables for reactive tour management.
keywords: GuideFlow Vue, Vue 3 product tour, Vue onboarding library, @guideflow/vue composable
---

# Vue 3

`@guideflow/vue` is a thin adapter over [`@guideflow/core`](/packages/core): a Vue plugin that
provides one `GuideFlowInstance` app-wide, and composables for reading and driving it.
`useTour()` projects the entire instance surface, so nothing in core is out of reach from Vue.

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

## Pause, resume and skip

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

const { isActive, isPaused, pause, resume, skip } = useTour()
</script>

<template>
  <template v-if="isActive">
    <button v-if="!isPaused" @click="pause()">Pause tour</button>
    <button v-else @click="resume()">Resume tour</button>
    <button @click="skip()">No thanks</button>
  </template>
</template>
```

`pause()` hides the UI but keeps the flow and its position; `stop()` ends it programmatically;
`skip()` ends it as a *user dismissal*, which is what a flow's `persistDismissal` option keys
off.

## Rendering your own popover

`currentStep` and `currentContent` expose the live step and its resolved content, so you can
draw the popover yourself:

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

Pass a custom `renderer` implementing `RendererContract` when creating the instance if you want
*only* your own popover — core's `DefaultRenderer` will otherwise draw one too.

## useHotspot()

Beacons whose lifetime follows the component:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useHotspot } from '@guideflow/vue'

const exportBtn = ref<HTMLButtonElement | null>(null)
useHotspot(exportBtn, { title: 'New', body: 'Export now supports CSV.' })
</script>

<template>
  <button ref="exportBtn">Export</button>
</template>
```

The beacon is removed on unmount and re-created if the ref changes. For app-scoped beacons use
`tour.hotspot()` / `tour.removeHotspot()` instead. Full details in the
[useHotspot() API reference](/api/vue/use-hotspot).

## useGuideFlow()

Returns the same instance without subscribing to it — handy for event listeners:

```vue
<script setup lang="ts">
import { useGuideFlow } from '@guideflow/vue'

const gf = useGuideFlow()

gf.on('tour:complete', ({ flowId }) => {
  console.warn('finished', flowId)
})
</script>
```

`useGuideFlow()` throws if the plugin was never installed. `useTour()` also returns it as
`tour.instance`.

## Options API

The plugin sets `app.config.globalProperties.$guideflow`, and the package augments Vue's
`ComponentCustomProperties`, so it is typed for TypeScript users without any `.d.ts` of your
own:

```ts
export default {
  mounted() {
    void this.$guideflow.start('welcome-tour')
  },
}
```

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
| `isPaused` | `Readonly<Ref<boolean>>` | Whether the active tour is paused |
| `currentStepId` | `Readonly<Ref<string \| null>>` | ID of the current step |
| `currentStepIndex` | `Readonly<Ref<number>>` | Zero-based step index |
| `totalSteps` | `Readonly<Ref<number>>` | Steps in the active flow state |
| `currentStep` | `Readonly<Ref<Step \| null>>` | The live step object |
| `currentContent` | `Readonly<Ref<StepContent \| null>>` | Its resolved content |
| `locale` | `Readonly<Ref<string>>` | Active i18n locale |
| `start(flow?, context?)` | `Promise<void>` | Start a flow; falls back to the `flowId` argument |
| `stop()` | `void` | Stop the active tour |
| `next()` / `prev()` | `Promise<void>` | Move between steps |
| `goTo(stepId)` | `Promise<void>` | Jump to a step by ID |
| `send(event)` | `Promise<void>` | Send a state machine event |
| `pause()` / `resume()` | `void` | Hide and re-show the UI without abandoning the flow |
| `skip()` | `void` | Dismiss the tour as the user would |
| `createFlow(def)` / `listFlows()` | — | Register and read the instance's flow registry |
| `configure(patch)` | `void` | Patch the instance config |
| `hotspot()` / `removeHotspot()` | — | Standalone beacons |
| `hints()` / `showHints()` / `hideHints()` | `void` | Hint badges |
| `i18n` / `progress` | subsystem | The instance's registry and progress store |
| `setLocale(locale)` | `void` | Switch locale and update the `locale` ref |
| `instance` | `GuideFlowInstance` | The raw instance |

Every state field returns to its idle value when the tour ends, so a progress indicator does
not stay stuck on the last step. Listeners are released on `onScopeDispose()`. Full details in
the [useTour() API reference](/api/vue/use-tour).

### useHotspot(target, options?)

Returns `{ id, remove }`; the beacon is removed when the effect scope is disposed. See the
[useHotspot() API reference](/api/vue/use-hotspot).

### useGuideFlow()

Returns the `GuideFlowInstance` provided by the plugin, or throws.

### GUIDEFLOW_KEY

The `InjectionKey<GuideFlowInstance>` used by the plugin, for manual `provide`/`inject`.
