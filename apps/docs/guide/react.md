# React

## Installation

```bash
pnpm add @guideflow/core @guideflow/react
```

## Setup

Wrap your application root with `TourProvider`:

```tsx
// app.tsx
import { createGuideFlow } from '@guideflow/core';
import { TourProvider } from '@guideflow/react';
import '@guideflow/core/styles';

// Create a singleton instance (or accept one from props/context)
export const gf = createGuideFlow({
  theme: 'minimal',
  locale: 'en',
});

export function App({ children }: { children: React.ReactNode }) {
  return <TourProvider instance={gf}>{children}</TourProvider>;
}
```

## Hooks

### `useTour()`

```tsx
import { useTour } from '@guideflow/react';

function TourControls() {
  const { isActive, currentStepIndex, totalSteps, next, prev, stop } = useTour();

  if (!isActive) return null;

  return (
    <div>
      Step {currentStepIndex + 1} of {totalSteps}
      <button onClick={prev}>Back</button>
      <button onClick={next}>Next</button>
      <button onClick={stop}>Skip</button>
    </div>
  );
}
```

### `useTourStep(stepId)`

```tsx
import { useTourStep } from '@guideflow/react';

function FeatureHighlight() {
  const { ref, isActive } = useTourStep<HTMLDivElement>('feature-card');

  return (
    <div ref={ref} style={{ outline: isActive ? '2px solid purple' : 'none' }}>
      My Feature
    </div>
  );
}
```

### `useHotspot(ref, options)`

```tsx
import { useRef } from 'react';
import { useHotspot } from '@guideflow/react';

function HelpBeacon() {
  const ref = useRef<HTMLButtonElement>(null);
  useHotspot(ref, { tooltip: 'Start the onboarding tour here!' });
  return <button ref={ref}>Help</button>;
}
```

## Components

### `<TourStep>`

Declaratively show content only when a step is active:

```tsx
import { TourStep } from '@guideflow/react';

<TourStep stepId="welcome">
  <div className="highlight-box">You are here!</div>
</TourStep>

// With render props
<TourStep stepId="welcome">
  {({ isActive }) => isActive && <Confetti />}
</TourStep>
```

### `<GuidePopover>`

A portal-rendered popover that manages its own positioning:

```tsx
import { GuidePopover } from '@guideflow/react';

<GuidePopover
  stepId="save-btn"
  title="Save your work"
  body="Click Save to persist your changes."
  placement="bottom"
/>
```

### `<HotspotBeacon>`

```tsx
import { HotspotBeacon } from '@guideflow/react';

<HotspotBeacon
  target="#help-btn"
  tooltip="Need help? Click here."
/>
```

### `<ConversationalPanel>`

A floating chat widget powered by `@guideflow/ai`:

```tsx
import { ConversationalPanel } from '@guideflow/react';

<ConversationalPanel
  placeholder="Ask anything about this page…"
  position="bottom-right"
/>
```
