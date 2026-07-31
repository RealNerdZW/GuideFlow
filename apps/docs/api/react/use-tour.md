---
description: "useTour() hook API reference — read tour state and drive a GuideFlow tour from any React component. Start, stop, advance, jump and send FSM events."
keywords: useTour hook, GuideFlow React hook, React tour state, @guideflow/react
---

# useTour()

Hook that exposes tour state plus the navigation methods of the instance provided by
[`TourProvider`](/api/react/tour-provider).

```ts
function useTour(flowId?: string): UseTourReturn
```

The optional `flowId` is a default for `start()` — calling `start()` with no argument starts that
flow id. The id must have been registered with `gf.createFlow(definition)` first.

## Usage

```tsx
import type { FlowDefinition } from '@guideflow/react'
import { useTour } from '@guideflow/react'

const flow: FlowDefinition = {
  id: 'welcome',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        { id: 'hello', target: '#sidebar', content: { title: 'Sidebar', body: 'Everything lives here.' } },
      ],
      on: { NEXT: 'outro' },
    },
    outro: {
      steps: [{ id: 'bye', content: { title: 'All set', body: 'That is the whole tour.' } }],
      final: true,
    },
  },
}

function TourControls() {
  const { start, stop, next, prev, isActive, currentStepIndex, totalSteps } = useTour()

  return (
    <div>
      <button onClick={() => void start(flow)}>Start tour</button>
      {isActive && (
        <>
          <span>Step {currentStepIndex + 1} of {totalSteps}</span>
          <button onClick={() => void prev()}>Back</button>
          <button onClick={() => void next()}>Next</button>
          <button onClick={stop}>Close</button>
        </>
      )}
    </div>
  )
}
```

## Return value

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | `boolean` | Whether a tour is currently running |
| `currentStepId` | `string \| null` | Id of the step being shown |
| `currentStepIndex` | `number` | Zero-based index of the current step within its state |
| `totalSteps` | `number` | Number of steps in the current flow state |
| `start` | `(flow?: FlowDefinition \| string, context?: GuidanceContext) => Promise<void>` | Start an inline flow or a registered flow id |
| `next` | `() => Promise<void>` | Advance one step, following the transition table at the end of a state |
| `prev` | `() => Promise<void>` | Go back one step, crossing state boundaries |
| `goTo` | `(stepId: string) => Promise<void>` | Jump to a step by id |
| `send` | `(event: string) => Promise<void>` | Send an FSM event to the machine |
| `stop` | `() => void` | End the active tour |

Every navigation method returns a promise because rendering a step is asynchronous (async
`content`, target resolution, scrolling). Awaiting is optional but recommended in tests.

If `start()` is called with no argument and no `flowId` was passed to the hook, it logs a warning
and does nothing.

## State updates

The returned state is re-read from the instance when any of these events fire: `tour:start`,
`tour:complete`, `tour:abandon`, `step:enter`, `step:exit`. Other lifecycle changes — notably
`pause()` and `resume()` — do not trigger a re-render of this hook.

## Not covered by this hook

`useTour()` is deliberately narrow. For `pause()`, `resume()`, `skip()`, `configure()`,
`createFlow()`, `hotspot()`, `hints()`, `i18n` or `progress`, use `useGuideFlow()` to get the
instance itself.

## Requirements

Must be used inside a [`<TourProvider>`](/api/react/tour-provider) — it throws otherwise.
