---
'@guideflow/svelte': patch
'@guideflow/vue': patch
---

Documentation only: the Vue and Svelte adapters now describe what they actually
ship.

- **Neither package contains components.** Both `package.json` descriptions
  advertised them ("composables and components", "stores and components"), and
  `@guideflow/svelte` carried a `tour-component` keyword. The descriptions now
  say plugin/composables and store, the keyword is replaced with `sveltekit`,
  and every README and docs page states plainly that the tour UI is drawn by
  `@guideflow/core`'s renderer.

- **The headline Svelte example did not compile.** It read `$tour.isActive`,
  but `createTourStore()` returns a plain object whose *fields* are stores —
  Svelte's `$` auto-subscription only applies to an identifier that is itself a
  store. Every example now destructures first (`const { isActive } = tour`) and
  writes `$isActive`. The same broken snippet in the `createTourStore` JSDoc is
  fixed too, along with its unbalanced `</>` in place of `{/if}`.

- **`theme` is not a config option.** Doc examples passed `theme: 'bold'` and
  `theme: 'minimal'` to `createGuideFlow()`, `createTourStore()` and
  `GuideFlowPlugin`; `GuideFlowConfig` has no such field, so those snippets were
  type errors. Replaced with real options.

- **`TourStore.destroy()` destroys the wrapped instance**, including one that
  was passed in, rather than only detaching its own listeners. The interface
  JSDoc, README and API reference now say so, and warn against calling it on a
  shared instance.

- **The step stores/refs do not reset when a tour ends.** `isActive` returns to
  `false`, but `currentStepId`, `currentStepIndex` and `totalSteps` retain their
  last rendered values in both adapters. Documented in the Vue and Svelte guides
  and references.

- Vue: cleanup is `onScopeDispose()`, not `onUnmounted()` — the reference said
  the latter, which understates that a bare `effectScope()` (a Pinia store) is
  covered. `goTo`, `send`, `currentStepId`, `GUIDEFLOW_KEY` and the fact that
  `GuideFlowPluginOptions` extends the whole of `GuideFlowConfig` (and that
  `instance` overrides it) were missing from the tables.

- The plugin reference no longer constructs `OpenAIProvider` with an API key in
  browser code; it uses `ProxyProvider`.
