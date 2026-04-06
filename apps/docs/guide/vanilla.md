---
description: Use GuideFlow with plain JavaScript or TypeScript — no framework required. @guideflow/core is zero-dependency and works in any vanilla JS or TypeScript project.
keywords: GuideFlow vanilla JS, javascript product tour, TypeScript tour library, framework-agnostic tour
---

# Vanilla JavaScript

GuideFlow's core engine works without any framework. Use it with plain JavaScript or TypeScript.

## Installation

```bash
npm install @guideflow/core
```

## Basic Tour

```ts
import { createGuideFlow } from '@guideflow/core'
import '@guideflow/core/styles'

const gf = createGuideFlow()

gf.start({
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

## Events

Subscribe to tour lifecycle events:

```ts
gf.on('tour:start', ({ flowId }) => console.warn('Started:', flowId))
gf.on('tour:complete', ({ flowId }) => console.warn('Completed:', flowId))
gf.on('tour:abandon', ({ flowId, stepId }) => console.warn('Abandoned at:', stepId))
gf.on('step:enter', ({ stepId, stepIndex }) => console.warn('Step:', stepIndex))

// All .on() calls return an unsubscribe function
const off = gf.on('tour:complete', handler)
off()
```

## Hotspots & Hints

```ts
// Persistent pulsing beacon
const id = gf.hotspot('#new-feature-btn', {
  title: 'New!',
  body: 'Check out the new export feature.',
  placement: 'top',
  color: '#6366f1',
})
gf.removeHotspot(id)

// Hint badges
gf.hints([
  { id: 'hint-1', target: '#settings', hint: 'Configure preferences' },
  { id: 'hint-2', target: '#export-btn', hint: 'Export your data' },
])
gf.showHints()
gf.hideHints()
```

## Attribute-Based Tours (Migration)

GuideFlow supports Intro.js-style data attributes for easy migration:

```html
<div data-intro="Welcome to the dashboard" data-step="1" data-position="right">
  Dashboard content
</div>

<div data-intro="Your profile settings" data-step="2" data-position="bottom">
  Profile content
</div>
```

```ts
import { autoInit } from '@guideflow/core'

// Scans data-intro attributes and starts a tour automatically
autoInit()
```

## CDN / Script Tag

Use the IIFE build for non-module environments:

```html
<link rel="stylesheet" href="https://unpkg.com/@guideflow/core/dist/styles/index.css">
<script src="https://unpkg.com/@guideflow/core/dist/index.global.js"></script>
<script>
  const gf = GuideFlow.createGuideFlow()
  gf.start({ /* flow definition */ })
</script>
```

## Configuration

```ts
const gf = createGuideFlow({
  spotlight: { padding: 8, borderRadius: 4, animated: true },
  persistence: { driver: 'localStorage', ttl: 30 * 24 * 60 * 60 * 1000 },
  context: { userId: 'user-123', roles: ['admin'] },
  nonce: 'csp-nonce',    // CSP nonce for injected styles
  injectStyles: true,     // auto-inject default CSS
  debug: false,
})
```
