---
description: "useTour() hook API reference — access tour state and control methods from any React component. Start, stop, advance, and observe GuideFlow tours reactively."
keywords: useTour hook, GuideFlow React hook, React tour state, @guideflow/react
---

# useTour()

Hook that provides tour state and control methods.

## Usage

```tsx
import { useTour } from '@guideflow/react'

function MyComponent() {
  const { start, stop, next, prev, isActive, currentStepIndex, totalSteps } = useTour()

  return (
    <div>
      <button onClick={() => start(flow)}>Start Tour</button>
      {isActive && (
        <div>
          <span>Step {currentStepIndex + 1} of {totalSteps}</span>
          <button onClick={prev}>Back</button>
          <button onClick={next}>Next</button>
          <button onClick={stop}>Close</button>
        </div>
      )}
    </div>
  )
}
```

## Return Value

| Property | Type | Description |
|----------|------|-------------|
| `start` | `(flow: FlowDefinition) => void` | Start a tour |
| `stop` | `() => void` | Stop the active tour |
| `next` | `() => void` | Advance to the next step |
| `prev` | `() => void` | Go to the previous step |
| `isActive` | `boolean` | Whether a tour is currently running |
| `currentStepIndex` | `number` | Zero-based index of the current step |
| `totalSteps` | `number` | Total number of steps |
| `currentStepId` | `string \| null` | ID of the current step |

## Requirements

Must be used inside a `<TourProvider>`.
