# TourStep

Component that renders the current tour step popover with spotlight overlay.

## Usage

```tsx
import { TourStep } from '@guideflow/react'

function App() {
  return (
    <TourProvider instance={gf}>
      <TourStep />
      <YourApp />
    </TourProvider>
  )
}
```

## Behavior

- Automatically renders when a tour is active
- Positions the popover relative to the current step's target element
- Manages the spotlight overlay
- Handles next/prev/skip button actions
- Hides when no tour is active

## Notes

- Place `TourStep` inside `TourProvider`
- Only one `TourStep` should be rendered at a time
- The component handles all positioning and lifecycle automatically
