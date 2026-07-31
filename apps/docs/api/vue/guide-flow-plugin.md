---
description: "GuideFlowPlugin API reference — Vue 3 plugin that installs a GuideFlow instance app-wide for @guideflow/vue."
keywords: GuideFlowPlugin, useGuideFlow, Vue plugin, @guideflow/vue
---

# GuideFlowPlugin

A Vue 3 plugin that installs a GuideFlow instance app-wide via `provide`/`inject`. Once
installed, any component in the tree can access the instance via [`useGuideFlow()`](#useguideflow),
the [`useTour()`](./use-tour) composable, or the `$guideflow` global property.

`@guideflow/vue` exports exactly four things — `GuideFlowPlugin`, `useGuideFlow`, `useTour` and
`GUIDEFLOW_KEY`. There are **no Vue components** in the package; the tour UI is drawn by
`@guideflow/core`'s renderer.

## Installation

```ts
import { createApp } from 'vue'
import { GuideFlowPlugin } from '@guideflow/vue'
import '@guideflow/core/styles'
import App from './App.vue'

const app = createApp(App)

app.use(GuideFlowPlugin, {
  debug: true,
  context: { userId: 'u_123' },
})

app.mount('#app')
```

## GuideFlowPluginOptions

```ts
interface GuideFlowPluginOptions extends GuideFlowConfig {
  instance?: GuideFlowInstance
}
```

Every [`GuideFlowConfig`](../create-guide-flow) field is accepted — `renderer`, `persistence`,
`context`, `spotlight`, `nonce`, `injectStyles`, `debug` — plus one extra:

| Option     | Type                | Description |
|------------|---------------------|-------------|
| `instance` | `GuideFlowInstance` | Provide an already-created instance instead of letting the plugin call `createGuideFlow()`. When set, the remaining config fields are ignored. |

```ts
// Pass an existing instance (e.g. one already augmented by createAI)
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// ProxyProvider holds no credential — your server endpoint keeps the API key.
// Never construct OpenAIProvider/AnthropicProvider in browser code.
const gf = createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), createGuideFlow())

app.use(GuideFlowPlugin, { instance: gf })
```

::: tip Register flows on the instance
`start('flow-id')` only resolves ids that were registered with
`instance.createFlow(definition)` on that same instance. Otherwise pass the
`FlowDefinition` object directly.
:::

---

## useGuideFlow()

Retrieves the `GuideFlowInstance` injected by the plugin. **Throws** if called outside a
component tree where the plugin is installed.

```ts
import { useGuideFlow } from '@guideflow/vue'
import type { GuideFlowInstance } from '@guideflow/vue'

const gf: GuideFlowInstance = useGuideFlow()
```

```vue
<script setup lang="ts">
import { useGuideFlow } from '@guideflow/vue'

const gf = useGuideFlow()

function startOnboarding() {
  void gf.start('onboarding')
}
</script>
```

Use this when you need the parts of the instance that [`useTour()`](./use-tour) does not
project: `hotspot()`, `hints()`, `pause()`/`resume()`, `i18n`, `progress`, `on()`.

---

## GUIDEFLOW_KEY

The `InjectionKey<GuideFlowInstance>` the plugin provides under. Exported for manual
`provide`/`inject` — for example to scope a second instance to a subtree.

```ts
import { inject, provide } from 'vue'
import { createGuideFlow } from '@guideflow/core'
import { GUIDEFLOW_KEY } from '@guideflow/vue'

provide(GUIDEFLOW_KEY, createGuideFlow())
// …deeper in the subtree
const gf = inject(GUIDEFLOW_KEY)
```

---

## $guideflow global

The plugin also sets `app.config.globalProperties.$guideflow`, making the instance available in
Options API components via `this.$guideflow`.

```ts
// Options API
export default {
  mounted() {
    void this.$guideflow.start('welcome-tour')
  },
}
```

`$guideflow` is set as an untyped global property, so it is not covered by
`ComponentCustomProperties` — TypeScript users should prefer `useGuideFlow()`.

## See also

- [useTour()](./use-tour) — reactive composable for tour state and controls
- [Vue guide](/guide/vue)
