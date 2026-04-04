# @guideflow/react

**React hooks and components for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/react.svg)](https://www.npmjs.com/package/@guideflow/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)

React adapter for [GuideFlow](https://github.com/johnmugabe/GuideFlow). Provides a context provider, hooks, and pre-built components for building product tours.

## Installation

```bash
npm install @guideflow/core @guideflow/react
```

## Quick Start

```tsx
import { createGuideFlow } from '@guideflow/core'
import { TourProvider, useTour } from '@guideflow/react'
import '@guideflow/core/styles'

const gf = createGuideFlow()

const welcomeFlow = gf.createFlow({
  id: 'welcome',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'step-1',
          content: { title: 'Hello!', body: 'Let us show you around.' },
          target: '#hero',
          placement: 'bottom',
        },
      ],
      final: true,
    },
  },
})

export function App() {
  return (
    <TourProvider instance={gf}>
      <Dashboard />
    </TourProvider>
  )
}

function Dashboard() {
  const { start, isActive, currentStepIndex, totalSteps } = useTour()

  return (
    <div>
      <button onClick={() => start(welcomeFlow)}>Start Tour</button>
      {isActive && <span>Step {currentStepIndex + 1} of {totalSteps}</span>}
    </div>
  )
}
```

## Key Exports

### Hooks

| Hook | Description |
|------|-------------|
| `useGuideFlow()` | Access the GuideFlow instance from context |
| `useTour()` | Tour state and controls (`start`, `stop`, `next`, `prev`, `isActive`, `currentStepIndex`, `totalSteps`) |
| `useTourStep()` | Current step details and navigation |
| `useHotspot()` | Hotspot management |

### Components

| Component | Description |
|-----------|-------------|
| `TourProvider` | Context provider — wraps your app |
| `TourStep` | Renders the current tour step popover |
| `GuidePopover` | Standalone popover component |
| `HotspotBeacon` | Pulsing beacon for hotspots |
| `ConversationalPanel` | AI-powered help chat panel (requires `@guideflow/ai`) |

## Conversational Help Panel

```tsx
import { ConversationalPanel } from '@guideflow/react'

function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Help</button>
      <ConversationalPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
```

> Requires `@guideflow/ai` to be configured on the GuideFlow instance.

## Peer Dependencies

- `react` ^17.0.0 || ^18.0.0 || ^19.0.0
- `react-dom` ^17.0.0 || ^18.0.0 || ^19.0.0

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)
