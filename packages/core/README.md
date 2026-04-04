# @guideflow/core

**Zero-dependency FSM engine for product tours, spotlights, hotspots, and hints.**

[![npm version](https://img.shields.io/npm/v/@guideflow/core.svg)](https://www.npmjs.com/package/@guideflow/core)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@guideflow/core?label=gzip)](https://bundlephobia.com/package/@guideflow/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)

The core engine behind [GuideFlow](https://github.com/johnmugabe/GuideFlow). Framework-agnostic — use it with vanilla JS or pair it with `@guideflow/react`, `@guideflow/vue`, or `@guideflow/svelte`.

## Installation

```bash
npm install @guideflow/core
```

## Quick Start

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

## Key Exports

| Export | Description |
|--------|-------------|
| `createGuideFlow()` | Main factory — returns a `GuideFlowInstance` |
| `createMachine()` | Low-level FSM state machine |
| `TourEngine` | Tour lifecycle management |
| `SpotlightOverlay` | Animated SVG cutout overlay |
| `HotspotManager` | Persistent pulsing beacons |
| `HintSystem` | Hint badge management |
| `ProgressStore` | localStorage / IndexedDB persistence |
| `BroadcastSync` | Cross-tab sync via BroadcastChannel |
| `I18nRegistry` | Translation registry with locale fallback |
| `DefaultRenderer` | Built-in step renderer |

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
  { id: 'hint-1', target: '#settings', hint: 'Configure your preferences here' },
])
gf.showHints()
```

## Events

```ts
gf.on('tour:start',    ({ flowId }) => { /* ... */ })
gf.on('tour:complete', ({ flowId }) => { /* ... */ })
gf.on('tour:abandon',  ({ flowId, stepId }) => { /* ... */ })
gf.on('step:enter',    ({ stepId, stepIndex }) => { /* ... */ })
gf.on('step:exit',     ({ stepId, stepIndex }) => { /* ... */ })
gf.on('hotspot:open',  ({ id }) => { /* ... */ })
gf.on('hint:click',    ({ id }) => { /* ... */ })
```

## Configuration

```ts
const gf = createGuideFlow({
  spotlight: { padding: 8, borderRadius: 4, animated: true },
  persistence: { driver: 'localStorage', ttl: 30 * 24 * 60 * 60 * 1000 },
  context: { userId: 'user-123', roles: ['admin'] },
  debug: false,
})
```

## Related Packages

- [`@guideflow/react`](https://www.npmjs.com/package/@guideflow/react) — React hooks & components
- [`@guideflow/vue`](https://www.npmjs.com/package/@guideflow/vue) — Vue 3 composables
- [`@guideflow/svelte`](https://www.npmjs.com/package/@guideflow/svelte) — Svelte stores
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation
- [`@guideflow/analytics`](https://www.npmjs.com/package/@guideflow/analytics) — Analytics & A/B testing
- [`@guideflow/cli`](https://www.npmjs.com/package/@guideflow/cli) — CLI tools

## License

[MIT](https://github.com/johnmugabe/GuideFlow/blob/master/LICENSE)
