---
description: Use GuideFlow with plain JavaScript or TypeScript — no framework required. @guideflow/core is zero-dependency and works in any vanilla JS or TypeScript project.
keywords: GuideFlow vanilla JS, javascript product tour, TypeScript tour library, framework-agnostic tour
---

# Vanilla JavaScript

GuideFlow's core engine works without any framework. Use it with plain
JavaScript or TypeScript.

## Installation

```bash
npm install @guideflow/core
```

## Basic Tour

```ts
import { createGuideFlow } from '@guideflow/core'
import '@guideflow/core/styles'

const gf = createGuideFlow()

await gf.start({
  id: 'welcome',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        {
          id: 'step-1',
          content: { title: 'Welcome!', body: 'This is your dashboard.' },
          target: '#sidebar',
          placement: 'right',
        },
        {
          id: 'step-2',
          content: { title: 'Your profile', body: 'Manage your account here.' },
          target: '#profile-btn',
          placement: 'bottom',
        },
      ],
      final: true,
    },
  },
})
```

## Controlling a running tour

```ts
await gf.next()
await gf.prev()
await gf.goTo('step-2')   // finds the step anywhere in the flow
await gf.send('SKIP')     // fire a state-machine event
gf.pause()                // hide the UI, keep the flow
gf.resume()
gf.skip()                 // dismiss as a user would → tour:dismiss
gf.stop()                 // programmatic stop → tour:abandon
gf.destroy()              // release everything

gf.isActive         // boolean
gf.currentStepId    // string | null
gf.currentStepIndex // number
gf.totalSteps       // steps in the current state
```

<kbd>→</kbd>/<kbd>↓</kbd> advance, <kbd>←</kbd>/<kbd>↑</kbd> go back and
<kbd>Escape</kbd> dismisses, while a tour is active and not paused.

## Events

```ts
gf.on('tour:start', ({ flowId }) => console.warn('Started:', flowId))
gf.on('tour:complete', ({ flowId }) => console.warn('Completed:', flowId))
gf.on('tour:abandon', ({ flowId, stepId, stepIndex }) => console.warn('Abandoned at:', stepId))
gf.on('tour:dismiss', ({ flowId, stepId }) => console.warn('User dismissed:', stepId))
gf.on('step:enter', ({ stepId, stepIndex, target }) => console.warn('Step:', stepIndex))
gf.on('step:exit', ({ stepId }) => console.warn('Left:', stepId))
gf.on('step:skip', ({ stepId }) => console.warn('Skipped:', stepId))
gf.on('tour:error', ({ stepId, error }) => console.error(stepId, error))

// All .on() calls return an unsubscribe function
const off = gf.on('tour:complete', handler)
off()
```

`tour:dismiss` fires only on a user dismissal (Escape, Skip, backdrop click) and
is always followed by `tour:abandon`.

## Hotspots & Hints

```ts
// Persistent pulsing beacon
const id = gf.hotspot('#new-feature-btn', {
  title: 'New!',
  body: 'Check out the new export feature.',
  color: '#6366f1',
  size: 12,
})
gf.removeHotspot(id)

// Hint badges
gf.hints([
  { id: 'hint-1', target: '#settings', hint: 'Configure preferences' },
  { id: 'hint-2', target: '#export-btn', hint: 'Export your data', icon: '?' },
])
gf.showHints()
gf.hideHints()
```

A hint badge shows its `icon`, or its 1-based position when `icon` is omitted.
Hotspots and hints are independent of tours — they need no active flow.

## Attribute-Based Tours

Annotate elements with `data-gf-*` attributes and GuideFlow can build the flow
for you. Steps are ordered by the numeric value of `data-gf-step`:

```html
<div data-gf-step="1" data-gf-title="Dashboard" data-gf-body="Welcome to the dashboard" data-gf-placement="right">
  Dashboard content
</div>

<div data-gf-step="2" data-gf-title="Profile" data-gf-body="Your profile settings" data-gf-placement="bottom">
  Profile content
</div>
```

| Attribute | Purpose |
|-----------|---------|
| `data-gf-step` | Required. Numeric order |
| `data-gf-title` | Step title |
| `data-gf-body` | Step body |
| `data-gf-placement` | Popover placement (default `bottom`) |
| `data-gf-show-if` | Dot-notation context path, e.g. `featureFlags.showTour`. Anything else is rejected with a warning — no expressions are evaluated |

```ts
import { autoInit } from '@guideflow/core'

// Scan the document and start the resulting tour
autoInit()

// Or build the flow yourself
import { scanAttributeTour, watchAttributeTour } from '@guideflow/core'

const flow = scanAttributeTour()          // FlowDefinition | null
const stop = watchAttributeTour((f) => void gf.start(f))  // re-scan on DOM changes
stop()
```

`autoInit()` uses the shared default instance unless you pass a config, in which
case it creates a new instance for that tour. All scanned steps land in a single
state, so the step counter and Back button cover the whole tour.

Intro.js's own `data-intro` / `data-step` attributes are **not** read — see
[migrating from Intro.js](/guide/migrate-intro).

## CDN / Script Tag

The IIFE build exposes a `GuideFlow` global:

```html
<link rel="stylesheet" href="https://unpkg.com/@guideflow/core/dist/styles/index.css">
<script src="https://unpkg.com/@guideflow/core/dist/index.global.js"></script>
<script>
  const gf = GuideFlow.createGuideFlow()
  gf.start({
    id: 'welcome',
    initial: 'intro',
    states: { intro: { steps: [/* ... */], final: true } },
  })
</script>
```

The same build is reachable as the `@guideflow/core/global` subpath export.

## Configuration

```ts
const gf = createGuideFlow({
  spotlight: { padding: 8, borderRadius: 4, animated: true, nonce: 'csp-nonce' },
  persistence: { driver: 'localStorage', ttl: 30 * 24 * 60 * 60 * 1000 },
  context: { userId: 'user-123', roles: ['admin'] },
  nonce: 'csp-nonce',    // popover / hotspot / hint styles
  injectStyles: true,     // set false to skip the renderer's own <style> tag
  debug: false,           // route internal logs to console.warn
})
```

Everything except `renderer` can be changed later with `gf.configure({ … })`;
`context` is merged into the running tour, the rest replaces wholesale.
