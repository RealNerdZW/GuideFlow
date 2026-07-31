---
description: "@guideflow/vue — Vue 3 plugin and composables for GuideFlow product tours. Register GuideFlowPlugin and use useTour() / useGuideFlow() for reactive tour management."
keywords: "@guideflow/vue, Vue 3 product tour, Vue onboarding composable, GuideFlow Vue plugin"
---

# @guideflow/vue

**Vue 3 plugin and composables for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/vue.svg)](https://www.npmjs.com/package/@guideflow/vue)

A thin adapter over [`@guideflow/core`](./core). It ships **no Vue components** — the tour UI is
drawn by core's renderer.

## Installation

```bash
npm install @guideflow/core @guideflow/vue
```

## Exports

This is the complete public surface.

| Export | Kind | Description |
|--------|------|-------------|
| `GuideFlowPlugin` | value | Vue plugin — provides one `GuideFlowInstance` app-wide and sets `$guideflow` |
| `useGuideFlow()` | value | Returns the injected instance; throws outside plugin scope |
| `useTour(flowId?)` | value | Reactive tour state (`isActive`, `currentStepId`, `currentStepIndex`, `totalSteps`) plus `start`/`next`/`prev`/`goTo`/`send`/`stop` |
| `GUIDEFLOW_KEY` | value | `InjectionKey<GuideFlowInstance>` for manual provide/inject |
| `GuideFlowPluginOptions` | type | `GuideFlowConfig` plus an optional `instance` |
| `UseTourReturn` | type | Return type of `useTour()` |

Core types are re-exported for convenience: `FlowDefinition`, `Step`, `StepContent`,
`GuidanceContext`, `HotspotOptions`, `HintStep`, `GuideFlowConfig`, `PopoverPlacement`,
`GuideFlowInstance`.

## Peer dependencies

- `vue` ^3.0.0

## Links

- [npm](https://www.npmjs.com/package/@guideflow/vue)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/vue)
- [Vue guide](/guide/vue)
- [GuideFlowPlugin API](/api/vue/guide-flow-plugin)
- [useTour() API](/api/vue/use-tour)
