---
description: "GuideFlowPlugin API reference — Vue 3 plugin that installs a GuideFlow instance app-wide for @guideflow/vue."
keywords: GuideFlowPlugin, useGuideFlow, Vue plugin, @guideflow/vue
---

# GuideFlowPlugin

A Vue 3 plugin that installs a GuideFlow instance app-wide via `provide`/`inject`. Once installed, any component in the tree can access the instance via [`useGuideFlow()`](#useguideflow) or the `$guideflow` global property.

## Installation

```ts
import { createApp } from 'vue'
import { GuideFlowPlugin } from '@guideflow/vue'
import App from './App.vue'

const app = createApp(App)

app.use(GuideFlowPlugin, {
  theme: 'bold',
  debug: true,
})

app.mount('#app')
```

## GuideFlowPluginOptions

Extends [`GuideFlowConfig`](../create-guide-flow) with one additional option:

| Option       | Type                  | Description |
|--------------|-----------------------|-------------|
| `instance`   | `GuideFlowInstance`   | Pass an already-created instance instead of letting the plugin create one |
| *(+ all `GuideFlowConfig` options)* | | |

```ts
// Pass an existing instance (e.g. one already augmented with createAI)
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createAI(new OpenAIProvider({ apiKey: '…' }), createGuideFlow({}))

app.use(GuideFlowPlugin, { instance: gf })
```

---

## useGuideFlow()

Retrieves the `GuideFlowInstance` injected by the plugin. Throws if called outside a component tree where the plugin is installed.

```ts
import { useGuideFlow } from '@guideflow/vue'

const gf: GuideFlowInstance = useGuideFlow()
```

```vue
<script setup>
import { useGuideFlow } from '@guideflow/vue'

const gf = useGuideFlow()

function startOnboarding() {
  gf.start('onboarding')
}
</script>
```

---

## $guideflow global

The plugin also sets `app.config.globalProperties.$guideflow`, making the instance available in Options API components via `this.$guideflow`.

```ts
// Options API
export default {
  mounted() {
    this.$guideflow.start('welcome-tour')
  },
}
```

## See Also

- [useTour()](./use-tour) — reactive composable for tour state and controls
