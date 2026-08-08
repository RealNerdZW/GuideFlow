---
description: Use GuideFlow with React. Install @guideflow/react, wrap your app with TourProvider, and drive tours with the useTour() hook.
keywords: GuideFlow React, React product tour, useTour hook, TourProvider, @guideflow/react
---

# React

## Installation

```bash
pnpm add @guideflow/core @guideflow/react
```

`react` and `react-dom` are peer dependencies (`^18 || ^19`). React 17 is not supported: the
adapter uses `useId` and `useSyncExternalStore`, both React 18 APIs.

Every module carries the `'use client'` directive, so the package can be imported from a Next.js
App Router application without a wrapper of your own.

## Setup

Wrap your application root with `TourProvider`. It either creates an instance from `config`, or
shares one you pass as `instance`.

```tsx
// app.tsx
import { createGuideFlow } from '@guideflow/core';
import { TourProvider } from '@guideflow/react';
import '@guideflow/core/styles';

// Create a singleton instance so you can reach gf.i18n / gf.progress / gf.destroy()
export const gf = createGuideFlow({ debug: true });

export function App({ children }: { children: React.ReactNode }) {
  return <TourProvider instance={gf}>{children}</TourProvider>;
}
```

`GuideFlowConfig` has no `theme` or `locale` field. Themes are stylesheets you import from
`@guideflow/core/styles`, and the locale is set on the instance:

```ts
gf.i18n.register('fr', { next: 'Suivant', prev: 'Retour', done: 'Terminé' });
gf.i18n.use('fr');
```

::: tip Who destroys the instance
An instance `TourProvider` creates from `config` is destroyed when the provider unmounts. One you
pass as `instance` — as above — is yours: the provider never destroys it, so call `gf.destroy()`
in your own teardown.
:::

## Who draws the popover

By default core draws it, exactly as it does for vanilla JS. If you would rather own the markup,
switch the provider to `renderer="react"` and mount `<GuidePopover>`:

```tsx
import { TourProvider, GuidePopover } from '@guideflow/react';
import '@guideflow/core/styles';

<TourProvider renderer="react">
  <App />
  <GuidePopover />
</TourProvider>;
```

| Mode | Who draws | `<GuidePopover>` |
|------|-----------|------------------|
| `renderer="core"` (default) | core's `DefaultRenderer` | renders `null`, warns once |
| `renderer="react"` | your React tree | **required** — without it there is a spotlight and no popover |

Only ever one of them draws: mounting `<GuidePopover>` on a default instance used to stack a
second `aria-modal` dialog on top of core's. See
[TourProvider](/api/react/tour-provider#choosing-who-draws-the-popover) for the case where you
build the instance yourself.

## Defining a flow

Flows are state machines. A flat `{ id, steps }` object is not a flow and will throw.

```ts
import type { FlowDefinition } from '@guideflow/react';

export const welcomeFlow: FlowDefinition = {
  id: 'welcome',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        {
          id: 'feature-card',
          target: '#feature-card',
          content: { title: 'Your features', body: 'Everything you use lives here.' },
        },
      ],
      on: { NEXT: 'outro' },
    },
    outro: {
      steps: [{ id: 'done', content: { title: 'All set', body: 'That is the whole tour.' } }],
      final: true,
    },
  },
};
```

A flow with no `final: true` state still emits `tour:complete` — a tour ends when there is nothing
left to render. Mark the last state `final: true` anyway: it is what stops the walk that computes
`totalSteps`, and [`guideflow validate`](/guide/authoring#validating-a-flow) warns when it is missing.

## Hooks

### `useTour(flowId?)`

```tsx
import { useTour } from '@guideflow/react';
import { welcomeFlow } from './flows';

function TourControls() {
  const { isActive, isPaused, currentStepIndex, totalSteps, start, next, prev, stop } = useTour();

  if (!isActive) {
    return <button onClick={() => void start(welcomeFlow)}>Start tour</button>;
  }

  return (
    <div>
      Step {currentStepIndex + 1} of {totalSteps}
      <button onClick={() => void prev()}>Back</button>
      <button onClick={() => void next()}>Next</button>
      <button onClick={stop}>Skip</button>
    </div>
  );
}
```

`start`, `next`, `prev`, `goTo` and `send` all return promises; `stop`, `pause`, `resume` and
`skip` are synchronous. `isPaused` is `true` between `pause()` and `resume()`, while `isActive`
stays `true`. Full reference: [useTour()](/api/react/use-tour).

### `useGuideFlow()`

Returns the instance itself, for anything `useTour()` does not expose (`configure`, `createFlow`,
`listFlows`, `hotspot`, `hints`, `i18n`, `progress`, `destroy`).

```tsx
import { useGuideFlow } from '@guideflow/react';

function PauseButton() {
  const gf = useGuideFlow();
  return <button onClick={() => gf.pause()}>Pause</button>;
}
```

### `useTourStep(stepId)`

Tells you whether a given step is active, and hands back a ref you can attach to your own element.

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

The ref is a plain `RefObject` for your own use — attaching it does **not** register the element
as the step's target. Targets come from the `target` field in the flow definition.

`isActive` is `false` while the tour is paused, so anything you key off it disappears with the
rest of the tour UI.

### `useHotspot(ref, options)`

Attaches a persistent pulsing beacon to an element for as long as the component is mounted.

```tsx
import { useRef } from 'react';
import { useHotspot } from '@guideflow/react';

function HelpBeacon() {
  const ref = useRef<HTMLButtonElement>(null);
  useHotspot(ref, { title: 'Need a hand?', body: 'Start the onboarding tour here.' });
  return <button ref={ref}>Help</button>;
}
```

`HotspotOptions` is `{ title?, body?, placement?, color?, size? }` — there is no `tooltip` field.
The hook returns `{ id }`: `null` on the first render, then the real hotspot id from the render
after the beacon is attached. Nothing is created if the ref is still empty when the effect runs.

## Components

### `<TourStep>`

Renders its children only while the named step is active. It does not draw a popover — the core
renderer does that.

```tsx
import { TourStep } from '@guideflow/react';

<TourStep id="feature-card">
  <div className="highlight-box">You are here!</div>
</TourStep>

// With a render prop
<TourStep id="feature-card">
  {({ next, prev }) => (
    <div>
      <button onClick={prev}>Back</button>
      <button onClick={next}>Continue</button>
    </div>
  )}
</TourStep>
```

The `id` must match a step id in your flow. See [TourStep](/api/react/tour-step).

### `<HotspotBeacon>`

The component form of `useHotspot`, targeting a CSS selector instead of a ref.

```tsx
import { HotspotBeacon } from '@guideflow/react';

<HotspotBeacon target="#help-btn" title="Need help?" body="Click here to get started." />
```

Props are `target: string` plus the fields of `HotspotOptions`. It renders `null` — the beacon is
injected into the DOM by the core hotspot manager.

### `<GuidePopover>`

The React-rendered popover, mounted through a portal. It draws **only** under
`<TourProvider renderer="react">`; under the default `renderer="core"` it renders `null` and warns
once, so the two never stack.

```tsx
import { GuidePopover } from '@guideflow/react';

<GuidePopover width={360} />

// or take over the layout entirely
<GuidePopover>
  {({ content, index, total, next }) => (
    <div>
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      <span>{index + 1} / {total}</span>
      <button onClick={next}>Next</button>
    </div>
  )}
</GuidePopover>
```

It honours `step.actions`, `step.media` and `gf.i18n`, positions before the first paint and
follows the target on scroll. `content.html` is rendered as plain text — see
[GuidePopover](/api/react/guide-popover#known-limitation-content-html).

### `<ConversationalPanel>`

A floating chat widget. It looks for an `ai` property on the GuideFlow instance and, when it is
absent, replies "AI module not configured." — see [AI chat](/guide/ai-chat) for wiring
`@guideflow/ai`.

```tsx
import { useState } from 'react';
import { ConversationalPanel } from '@guideflow/react';

function HelpWidget() {
  const [open, setOpen] = useState(false);
  return (
    <ConversationalPanel
      open={open}
      onClose={() => setOpen(false)}
      title="Need help?"
      placeholder="Ask anything about this page…"
    />
  );
}
```

Props: `open` (default `true`), `onClose`, `title`, `placeholder`, `className`. The panel is fixed
to the bottom-right corner; there is no `position` prop.

Any selectors the model returns as `highlights` are rendered as buttons under the answer, and the
first one is scrolled into view automatically. A request still in flight when the panel unmounts
is discarded rather than committed — note that `GuideBrain.chat()` takes no `AbortSignal`, so the
network request itself is not cancelled. Failures are logged with `console.error` and shown as a
"Something went wrong" reply.
