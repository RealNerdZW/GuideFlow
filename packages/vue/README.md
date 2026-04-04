# @guideflow/vue

**Vue 3 composables and plugin for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/vue.svg)](https://www.npmjs.com/package/@guideflow/vue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)

Vue 3 adapter for [GuideFlow](https://github.com/johnmugabe/GuideFlow). Provides a Vue plugin and composables for building product tours.

## Installation

```bash
npm install @guideflow/core @guideflow/vue
```

## Quick Start

### Plugin Setup

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

### Using the Composable

```vue
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

const { start, isActive, currentStepIndex, totalSteps } = useTour()

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

## Key Exports

| Export | Description |
|--------|-------------|
| `GuideFlowPlugin` | Vue plugin — installs GuideFlow into the app |
| `useGuideFlow()` | Access the GuideFlow instance via `inject()` |
| `useTour()` | Tour state and controls (`start`, `stop`, `next`, `prev`, `isActive`, `currentStepIndex`, `totalSteps`) |
| `GUIDEFLOW_KEY` | Injection key for manual provide/inject |

## Peer Dependencies

- `vue` ^3.0.0

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)
