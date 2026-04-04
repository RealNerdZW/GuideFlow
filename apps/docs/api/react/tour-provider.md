# TourProvider

React context provider that makes the GuideFlow instance available to all child components.

## Usage

```tsx
import { createGuideFlow } from '@guideflow/core'
import { TourProvider } from '@guideflow/react'

const gf = createGuideFlow()

function App() {
  return (
    <TourProvider instance={gf}>
      <YourApp />
    </TourProvider>
  )
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `instance` | `GuideFlowInstance` | Yes | The GuideFlow instance to provide |
| `children` | `ReactNode` | Yes | Child components |

## Notes

- Place `TourProvider` near the root of your component tree
- All `useTour()`, `useGuideFlow()`, and `useTourStep()` hooks must be used inside a `TourProvider`
- Only one `TourProvider` should be active at a time
