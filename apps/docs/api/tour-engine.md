---
description: TourEngine API reference — manages the GuideFlow tour lifecycle including start, stop, step navigation, and event emission. Core orchestrator of all tour flows.
keywords: TourEngine API, GuideFlow tour lifecycle, start tour, stop tour, tour events
---

# TourEngine

The `TourEngine` manages the tour lifecycle — starting, stopping, stepping through flows, and emitting events.

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `tour:start` | `{ flowId }` | Tour started |
| `tour:complete` | `{ flowId }` | All steps completed |
| `tour:abandon` | `{ flowId, stepId, stepIndex }` | Tour closed early |
| `step:enter` | `{ stepId, stepIndex, target }` | Step became active |
| `step:exit` | `{ stepId, stepIndex }` | Step was dismissed |
| `step:skip` | `{ stepId }` | Step was skipped (via `showIf`) |
| `hotspot:open` | `{ id }` | Hotspot tooltip opened |
| `hint:click` | `{ id }` | Hint badge clicked |

## Subscribing

```ts
const gf = createGuideFlow()

// Subscribe
const off = gf.on('tour:complete', ({ flowId }) => {
  console.warn('Completed:', flowId)
})

// Unsubscribe
off()
```

## Tour Control

| Method | Description |
|--------|-------------|
| `start(flow)` | Begin a tour. Throws if a tour is already active. |
| `stop()` | Stop the active tour. Emits `tour:abandon`. |
| `next()` | Advance to the next step. If last step, completes the tour. |
| `prev()` | Go back one step. No-op if on the first step. |

## Active Tour State

Access the current tour state through framework adapters:

```ts
// React
const { isActive, currentStepIndex, totalSteps } = useTour()

// Vue
const { isActive, currentStepIndex, totalSteps } = useTour()

// Svelte
const { isActive, currentStepIndex, totalSteps } = createTourStore(gf)
```
