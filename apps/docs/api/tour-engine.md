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
| `tour:dismiss` | `{ flowId, stepId, stepIndex }` | User actively dismissed the tour (<kbd>Escape</kbd>, Skip, backdrop click). Always followed by `tour:abandon`. |
| `tour:pause` | `{ flowId, stepId }` | Tour paused via `pause()` |
| `tour:resume` | `{ flowId, stepId }` | Tour resumed via `resume()` |
| `tour:error` | `{ flowId, stepId, error }` | A step failed to render; the tour was ended |
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
| `start(flow)` | Begin a tour. Ends any tour already running. |
| `stop()` | Stop the active tour programmatically. Emits `tour:abandon`. |
| `skip()` | Dismiss the tour as a user would. Emits `step:skip`, then `tour:dismiss`, then `tour:abandon`. |
| `next()` | Advance to the next step. Completes the tour when no step remains. |
| `prev()` | Go back one step, crossing into the previous state when at the start of the current one. No-op at the very first step. |
| `goTo(stepId)` | Jump to a step by id, anywhere in the flow. |
| `send(event)` | Fire a state-machine event. |
| `pause()` / `resume()` | Hide the UI without abandoning the flow, then restore it. A paused tour ignores the keyboard. Read the current state with `isPaused` — `isActive` stays `true` while paused. |

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
