---
description: "@guideflow/react — React hooks and components for GuideFlow product tours. TourProvider, useTour(), useTourStep(), useHotspot(), TourStep, HotspotBeacon."
keywords: "@guideflow/react, React product tour hooks, useTour hook, TourProvider component, React onboarding"
---

# @guideflow/react

**React hooks and components for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/react.svg)](https://www.npmjs.com/package/@guideflow/react)

## Installation

```bash
npm install @guideflow/core @guideflow/react
```

## Key exports

| Export | Type | Description |
|--------|------|-------------|
| `TourProvider` | Component | Shares a `GuideFlowInstance` through context |
| `useGuideFlow()` | Hook | Returns the instance; throws outside a provider |
| `useTour(flowId?)` | Hook | Tour state (`isActive`, `currentStepId`, `currentStepIndex`, `totalSteps`) plus `start` / `next` / `prev` / `goTo` / `send` / `stop` |
| `useTourStep(stepId)` | Hook | `{ ref, isActive }` — is this step active right now |
| `useHotspot(ref, options)` | Hook | Attaches a pulsing beacon to a ref for the component's lifetime |
| `TourStep` | Component | Renders its children only while a named step is active |
| `HotspotBeacon` | Component | Selector-targeted beacon; renders `null` |
| `ConversationalPanel` | Component | Floating AI chat panel (needs `@guideflow/ai` on the instance) |
| `GuidePopover` | Component | Experimental portal popover — see its [limitations](/api/react/guide-popover#current-limitations) |

The package also re-exports the core types `FlowDefinition`, `Step`, `StepContent`,
`GuidanceContext`, `HotspotOptions`, `HintStep`, `GuideFlowConfig` and `PopoverPlacement`, plus its
own prop types (`TourProviderProps`, `TourStepProps`, `GuidePopoverProps`, `HotspotBeaconProps`,
`ConversationalPanelProps`, `UseTourReturn`, `TourState`, `UseTourStepReturn`, `UseHotspotReturn`,
`Message`).

The popover and spotlight you see during a tour are drawn by `@guideflow/core`'s default renderer.
None of the components in this package are required to run a tour.

## Peer dependencies

- `react` ^17.0.0 || ^18.0.0 || ^19.0.0
- `react-dom` ^17.0.0 || ^18.0.0 || ^19.0.0

## Links

- [npm](https://www.npmjs.com/package/@guideflow/react)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/react)
- [React Guide](/guide/react)
- [API Reference](/api/react/tour-provider)
