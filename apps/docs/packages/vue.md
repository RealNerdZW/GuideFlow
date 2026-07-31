---
description: "@guideflow/vue — Vue 3 plugin and composables for GuideFlow product tours. Register GuideFlowPlugin and use useTour() / useGuideFlow() for reactive tour management."
keywords: "@guideflow/vue, Vue 3 product tour, Vue onboarding composable, GuideFlow Vue plugin"
---

# @guideflow/vue

**Vue 3 plugin and composables for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/vue.svg)](https://www.npmjs.com/package/@guideflow/vue)

A thin adapter over [`@guideflow/core`](./core). It ships **no Vue components** — the tour UI is
drawn by core's renderer, or by your own markup driven from `currentStep` / `currentContent`.

## Installation

```bash
npm install @guideflow/core @guideflow/vue
```

## Exports

This is the complete public surface.

| Export | Kind | Description |
|--------|------|-------------|
| `GuideFlowPlugin` | value | Vue plugin — provides one `GuideFlowInstance` app-wide and sets a typed `$guideflow` |
| `useGuideFlow()` | value | Returns the injected instance; throws outside plugin scope |
| `useTour(flowId?)` | value | The full reactive control surface — see below |
| `useHotspot(target, options?)` | value | Beacon bound to a template ref or selector; removed on scope dispose |
| `GUIDEFLOW_KEY` | value | `InjectionKey<GuideFlowInstance>` for manual provide/inject |
| `GuideFlowPluginOptions` | type | `GuideFlowConfig` plus an optional `instance` |
| `UseTourReturn` | type | Return type of `useTour()` |
| `UseHotspotReturn`, `HotspotTarget` | type | `useHotspot()`'s return and target types |

### useTour(flowId?)

| Group | Members |
|-------|---------|
| Reactive state | `isActive`, `isPaused`, `currentStepId`, `currentStepIndex`, `totalSteps`, `currentStep`, `currentContent`, `locale` |
| Navigation | `start`, `next`, `prev`, `goTo`, `send`, `stop`, `pause`, `resume`, `skip` |
| Flows & config | `createFlow`, `listFlows`, `configure` |
| Standalone UI | `hotspot`, `removeHotspot`, `hints`, `showHints`, `hideHints` |
| Subsystems | `i18n`, `progress`, `setLocale`, `instance` |

Every state field returns to its idle value when a tour ends. Listeners are released via
`onScopeDispose()`.

The package augments Vue's `ComponentCustomProperties`, so `this.$guideflow` is typed in
Options API components.

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
