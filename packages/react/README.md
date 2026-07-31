# @guideflow/react

**React hooks and components for GuideFlow product tours.**

[![npm version](https://img.shields.io/npm/v/@guideflow/react.svg)](https://www.npmjs.com/package/@guideflow/react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

React adapter for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). Provides a context provider, hooks, and pre-built components for building product tours.

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
| `useTour()` | Tour state and controls (`start`, `stop`, `next`, `prev`, `goTo`, `send`, `pause`, `resume`, `skip`, `isActive`, `isPaused`, `currentStepIndex`, `totalSteps`) |
| `useTourStep(stepId)` | Whether that step is on screen, plus a ref for your own element |
| `useHotspot(ref, options)` | Attach a pulsing beacon to a ref; returns its id |
| `useTourRenderer()` | The headless renderer, for building your own popover |

### Components

| Component | Description |
|-----------|-------------|
| `TourProvider` | Context provider — wraps your app, owns the instance it creates |
| `TourStep` | Renders its children only while a named step is on screen |
| `GuidePopover` | The React-rendered popover (needs `renderer="react"`) |
| `HotspotBeacon` | Pulsing beacon for hotspots |
| `ConversationalPanel` | AI-powered help chat panel (requires `@guideflow/ai`) |

## Who draws the popover

By default core's renderer draws it, and `<GuidePopover>` renders nothing. Switch the provider to
`renderer="react"` to let React own the markup instead:

```tsx
import { TourProvider, GuidePopover } from '@guideflow/react'

<TourProvider renderer="react">
  <App />
  <GuidePopover />   {/* required in this mode */}
</TourProvider>
```

Only one of the two ever draws, so there is never more than one `aria-modal` dialog on the page.
See the [TourProvider reference](https://github.com/RealNerdZW/GuideFlow#readme) for the case
where you create the instance yourself with `createHeadlessRenderer()`.

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

- `react` ^18.0.0 || ^19.0.0
- `react-dom` ^18.0.0 || ^19.0.0

React 17 is not supported: the adapter uses `useId` and `useSyncExternalStore`, both introduced in
React 18. Every module carries `'use client'`, so the package is importable from a Next.js App
Router app.

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
