---
description: Add GuideFlow product tours to a Vue 3 app. Install @guideflow/vue, register the plugin, and use useGuideFlow() composables for reactive tour management.
keywords: GuideFlow Vue, Vue 3 product tour, Vue onboarding library, @guideflow/vue composable
---

# Vue 3

GuideFlow provides a Vue 3 plugin and composables for reactive tour management.

## Installation

```bash
npm install @guideflow/core @guideflow/vue
```

## Plugin Setup

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

## useTour Composable

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

const { start, stop, next, prev, isActive, currentStepIndex, totalSteps } = useTour()

const flow = {
  id: 'welcome',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'step-1',
          content: { title: 'Welcome!' },
          target: '#hero',
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

## useGuideFlow Composable

Access the raw GuideFlow instance:

```vue
<script setup lang="ts">
import { useGuideFlow } from '@guideflow/vue'

const gf = useGuideFlow()

// Access hotspots, hints, events directly
gf.hotspot('#new-feature', {
  title: 'New!',
  body: 'Check out this feature.',
})
</script>
```

## API Reference

### GuideFlowPlugin

| Option | Type | Description |
|--------|------|-------------|
| `instance` | `GuideFlowInstance` | The GuideFlow instance to provide |

### useTour()

| Return | Type | Description |
|--------|------|-------------|
| `start(flow)` | `function` | Start a tour |
| `stop()` | `function` | Stop the active tour |
| `next()` | `function` | Advance to next step |
| `prev()` | `function` | Go to previous step |
| `isActive` | `Ref<boolean>` | Whether a tour is running |
| `currentStepIndex` | `Ref<number>` | Current step index |
| `totalSteps` | `Ref<number>` | Total steps in tour |

### useGuideFlow()

Returns the `GuideFlowInstance` from the plugin injection.
