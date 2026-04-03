# GuideFlow.js

**AI-Powered Product Tours. Guide users like you know them.**

[![Build](https://img.shields.io/github/actions/workflow/status/innfuture/guideflow/ci.yml?branch=main&label=build)](https://github.com/innfuture/guideflow/actions)
[![npm version](https://img.shields.io/npm/v/@guideflow/core.svg)](https://www.npmjs.com/package/@guideflow/core)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@guideflow/core?label=core%20gzip)](https://bundlephobia.com/package/@guideflow/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

GuideFlow is a modular, framework-agnostic product tour library with a built-in finite state machine engine, AI-powered tour generation, analytics, and A/B testing. It works with React, Vue, Svelte, or plain JavaScript.

---

## Features

- **Zero-dependency core** — the FSM engine, spotlight, and renderer ship without a single runtime dependency
- **Finite state machine tours** — flows are state machines: transitions, guards, context, entry/exit hooks
- **AI tour generation** — generate step sequences from a plain-English prompt (OpenAI, Anthropic, Ollama)
- **Intent detection** — passively monitor user behaviour and surface help when they get stuck
- **Conversational help** — embedded AI chat panel with DOM highlighting
- **Framework adapters** — first-class React, Vue 3, and Svelte support
- **Spotlight overlay** — animated SVG cutout that tracks any element through scroll and resize
- **Persistent progress** — localStorage, IndexedDB, or a custom driver; cross-tab sync via BroadcastChannel
- **Analytics** — structured events forwarded to PostHog, Mixpanel, Amplitude, Segment, or a webhook
- **A/B testing** — deterministic variant assignment with `ExperimentEngine`
- **Hotspots & hints** — persistent pulsing beacons and hint badges independent of tours
- **i18n** — extensible translation registry with locale fallback
- **CLI** — scaffold configs, launch the visual studio, export flows, and push to GuideFlow Cloud
- **Strict TypeScript** — full generics, exact optional property types, declaration maps

---

## Packages

| Package | Description | Size |
|---|---|---|
| [`@guideflow/core`](packages/core) | Zero-dependency FSM engine, spotlight, persistence, i18n | ~12 kB gzip |
| [`@guideflow/react`](packages/react) | `TourProvider`, `useTour`, `useTourStep`, `useHotspot` | — |
| [`@guideflow/vue`](packages/vue) | `GuideFlowPlugin`, `useTour` composable | — |
| [`@guideflow/svelte`](packages/svelte) | `createTourStore`, `Readable` stores | — |
| [`@guideflow/ai`](packages/ai) | `GuideBrain`, OpenAI / Anthropic / Ollama providers | — |
| [`@guideflow/analytics`](packages/analytics) | `AnalyticsCollector`, transport adapters, `ExperimentEngine` | — |
| [`@guideflow/cli`](packages/cli) | `init`, `studio`, `export`, `push` commands | — |
| [`@guideflow/devtools`](packages/devtools) | Browser extension for visual tour building _(coming soon)_ | — |

---

## Installation

Install the core engine and your framework adapter:

```bash
# pnpm
pnpm add @guideflow/core @guideflow/react

# npm
npm install @guideflow/core @guideflow/react

# yarn
yarn add @guideflow/core @guideflow/react
```

For AI features:

```bash
pnpm add @guideflow/ai openai          # OpenAI
pnpm add @guideflow/ai @anthropic-ai/sdk  # Anthropic
```

For analytics:

```bash
pnpm add @guideflow/analytics
```

---

## Quick Start

### Vanilla JavaScript

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

### React

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

### Vue 3

```ts
// main.ts
import { createApp } from 'vue'
import { createGuideFlow } from '@guideflow/core'
import { GuideFlowPlugin } from '@guideflow/vue'
import '@guideflow/core/styles'
import App from './App.vue'

const gf = createGuideFlow()
const app = createApp(App)
app.use(GuideFlowPlugin, { instance: gf })
app.mount('#app')
```

```vue
<!-- OnboardingButton.vue -->
<script setup lang="ts">
import { useTour } from '@guideflow/vue'

const { start, isActive, currentStepIndex, totalSteps } = useTour()

const flow = {
  id: 'welcome',
  initial: 'main',
  states: {
    main: {
      steps: [{ id: 'step-1', content: { title: 'Welcome!' }, target: '#hero', placement: 'bottom' }],
      final: true,
    },
  },
}
</script>

<template>
  <button @click="start(flow)">Start Tour</button>
  <span v-if="isActive">Step {{ currentStepIndex + 1 }} of {{ totalSteps }}</span>
</template>
```

### Svelte

```svelte
<script lang="ts">
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const store = createTourStore(createGuideFlow())
  const { isActive, currentStepIndex, totalSteps, start } = store

  const flow = {
    id: 'welcome',
    initial: 'main',
    states: {
      main: {
        steps: [{ id: 'step-1', content: { title: 'Hello!' }, target: '#hero', placement: 'bottom' }],
        final: true,
      },
    },
  }
</script>

<button on:click={() => start(flow)}>Start Tour</button>
{#if $isActive}
  <span>Step {$currentStepIndex + 1} of {$totalSteps}</span>
{/if}
```

---

## AI Integration

GuideFlow's AI layer lives in `@guideflow/ai`. All providers are lazy-loaded — only the SDK you actually
import is included in your bundle.

### Generate a tour from a prompt

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, OpenAIProvider } from '@guideflow/ai'

const gf = createGuideFlow()

createAI(
  new OpenAIProvider({ apiKey: import.meta.env.VITE_OPENAI_KEY }),
  gf,
)

// Generate steps from a natural-language description of the page
const steps = await gf.ai.generate('Walk me through the checkout flow')
await gf.start({ id: 'ai-tour', initial: 'main', states: { main: { steps, final: true } } })
```

### Anthropic

```ts
import { AnthropicProvider } from '@guideflow/ai'

createAI(
  new AnthropicProvider({ apiKey: import.meta.env.VITE_ANTHROPIC_KEY }),
  gf,
)
```

### Local Ollama

```ts
import { OllamaProvider } from '@guideflow/ai'

createAI(new OllamaProvider({ model: 'llama3', baseUrl: 'http://localhost:11434' }), gf)
```

### Intent detection

Passively watch user behaviour and trigger help flows automatically:

```ts
createAI(new OpenAIProvider({ apiKey: '...' }), gf, { autoWatch: false })

const stopWatch = gf.ai.watch()

gf.ai.on('intent:detected', (signal) => {
  // signal.type: 'confused' | 'stuck' | 'exploring' | 'engaged'
  if (signal.type === 'confused' && signal.confidence > 0.8) {
    gf.start(helpFlow)
  }
})

// Stop watching when no longer needed
stopWatch()
```

### Conversational help panel (React)

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

> `ConversationalPanel` requires `@guideflow/ai` to be configured on the GuideFlow instance.

---

## Analytics & A/B Testing

### Collect tour events

```ts
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics'

const collector = new AnalyticsCollector({
  userId: 'user-123',
  globalProperties: { plan: 'pro', version: '2.1' },
})

collector
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: '/api/analytics/guideflow' }))

collector.attach(gf)

// Flush all buffered events (e.g. on page unload)
await collector.flush()
```

**Events emitted:**

| Event | Triggered when |
|---|---|
| `guideflow.tour.started` | Tour begins |
| `guideflow.tour.completed` | All steps finished |
| `guideflow.tour.abandoned` | Tour closed early |
| `guideflow.step.viewed` | Step enters viewport |
| `guideflow.step.exited` | Step dismissed (includes `dwell_ms`) |
| `guideflow.step.skipped` | Step conditionally skipped |

**Available transports:** `PostHogTransport`, `MixpanelTransport`, `AmplitudeTransport`, `SegmentTransport`, `WebhookTransport`

### A/B testing

```ts
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine('user-123')

const { value: theme } = engine.assign({
  id: 'tour-theme-q1-2025',
  variants: [
    { id: 'control',   value: 'minimal', weight: 50 },
    { id: 'treatment', value: 'bold',    weight: 50 },
  ],
})

// Assignment is deterministic — same userId always gets same variant
const gf = createGuideFlow({ /* theme */ })
```

---

## Configuration Reference

### `GuideFlowConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `renderer` | `RendererContract` | `DefaultRenderer` | Custom step renderer |
| `persistence` | `PersistenceConfig` | `undefined` | Progress persistence settings |
| `context` | `GuidanceContext` | `{}` | Shared context passed to steps and guards |
| `spotlight` | `SpotlightOptions` | `{}` | Spotlight overlay options |
| `nonce` | `string` | `undefined` | CSP nonce for injected `<style>` tags |
| `injectStyles` | `boolean` | `true` | Auto-inject default CSS |
| `debug` | `boolean` | `false` | Enable debug logging |

### `SpotlightOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `padding` | `number` | `8` | Padding around highlighted element (px) |
| `borderRadius` | `number` | `4` | Corner radius of spotlight cutout (px) |
| `animated` | `boolean` | `true` | Animate spotlight transitions |
| `overlayColor` | `string` | `'#000'` | Overlay background color |
| `overlayOpacity` | `number` | `0.5` | Overlay opacity (0–1) |

### `PersistenceConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `driver` | `'localStorage' \| 'indexedDB' \| PersistenceDriver` | `'localStorage'` | Storage backend |
| `key` | `(userId: string) => string` | Built-in | Custom storage key factory |
| `ttl` | `number` | `2592000000` (30 days) | Progress expiry in milliseconds |

### `GuidanceContext`

| Field | Type | Description |
|---|---|---|
| `userId` | `string` | Used for persistence and analytics |
| `roles` | `string[]` | Used in `showIf` guards |
| `featureFlags` | `Record<string, boolean>` | Used in `showIf` guards |
| `[key]` | `unknown` | Any additional custom data |

### `Step`

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique step identifier |
| `target` | `string \| Element \| null` | CSS selector or DOM element to anchor to |
| `content` | `StepContent \| () => StepContent` | `{ title?, body?, html? }` — can be async |
| `placement` | `PopoverPlacement` | One of 13 placements or `'center'` |
| `showIf` | `(ctx: TContext) => boolean` | Conditionally skip this step |
| `clickThrough` | `boolean` | Allow clicks to pass through the spotlight |
| `scrollIntoView` | `boolean` | Auto-scroll target into view (default `true`) |
| `actions` | `StepAction[]` | Override default next/prev/skip buttons |

**`PopoverPlacement` values:** `top`, `top-start`, `top-end`, `bottom`, `bottom-start`, `bottom-end`, `left`, `left-start`, `left-end`, `right`, `right-start`, `right-end`, `center`

---

## Flow Definition (State Machine)

GuideFlow tours are finite state machines. Each state holds an array of steps; events trigger transitions.

```ts
import { createGuideFlow } from '@guideflow/core'

const gf = createGuideFlow({
  context: { userId: 'u1', roles: ['admin'] },
})

const onboardingFlow = gf.createFlow({
  id: 'onboarding',
  initial: 'setup',
  context: { completedSteps: 0 },
  states: {
    setup: {
      steps: [
        { id: 'profile', content: { title: 'Set up your profile' }, target: '#profile-form' },
        { id: 'avatar',  content: { title: 'Add a photo' },          target: '#avatar-upload' },
      ],
      on: { NEXT: 'features' },
      onExit: (ctx) => { ctx.completedSteps++ },
    },
    features: {
      steps: [
        {
          id: 'dashboard',
          content: { title: 'Your dashboard' },
          target: '#dashboard',
          // Only show to admins
          showIf: (ctx) => ctx.roles?.includes('admin') ?? false,
        },
      ],
      final: true,
    },
  },
})

await gf.start(onboardingFlow)
```

---

## Hotspots & Hints

Hotspots and hints persist independently of any active tour.

```ts
// Persistent pulsing beacon on an element
const id = gf.hotspot('#new-feature-btn', {
  title: 'New!',
  body: 'Check out the new export feature.',
  placement: 'top',
  color: '#6366f1',
})

// Remove later
gf.removeHotspot(id)

// Hint badges
gf.hints([
  { id: 'hint-1', target: '#settings', hint: 'Configure your preferences here' },
  { id: 'hint-2', target: '#export-btn', hint: 'Export your data as CSV' },
])
gf.showHints()
gf.hideHints()
```

---

## Events

`GuideFlowInstance` is an event emitter. Subscribe to any tour lifecycle event:

```ts
gf.on('tour:start',    ({ flowId }) => console.warn('Tour started:', flowId))
gf.on('tour:complete', ({ flowId }) => console.warn('Tour completed:', flowId))
gf.on('tour:abandon',  ({ flowId, stepId, stepIndex }) => { /* ... */ })
gf.on('step:enter',    ({ stepId, stepIndex, target }) => { /* ... */ })
gf.on('step:exit',     ({ stepId, stepIndex }) => { /* ... */ })
gf.on('step:skip',     ({ stepId }) => { /* ... */ })
gf.on('hotspot:open',  ({ id }) => { /* ... */ })
gf.on('hint:click',    ({ id }) => { /* ... */ })

// All .on() calls return an unsubscribe function
const off = gf.on('tour:complete', handler)
off() // unsubscribe
```

---

## CLI

Install the CLI globally or use it via `pnpm exec`:

```bash
pnpm add -g @guideflow/cli
```

| Command | Description |
|---|---|
| `guideflow init` | Scaffold a `guideflow.config.ts` and example flow |
| `guideflow studio` | Launch the visual tour editor (opens browser) |
| `guideflow export` | Export flow definitions to JSON |
| `guideflow push` | Publish flows to GuideFlow Cloud |

---

## Intro.js / Driver.js Migration

GuideFlow includes a compatibility layer for attribute-based tours:

```html
<!-- Intro.js-style attributes are supported -->
<div data-intro="Welcome to the dashboard" data-step="1" data-position="right">...</div>
```

```ts
import { autoInit } from '@guideflow/core'

// Automatically scans data-intro attributes and starts a tour
autoInit()
```

---

## Contributing

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8 (`npm install -g pnpm`)

### Setup

```bash
git clone https://github.com/innfuture/guideflow.git
cd guideflow
pnpm install
pnpm build
```

### Development scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start all packages in watch mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm lint` | Lint with ESLint |
| `pnpm type-check` | Run TypeScript type-checking |
| `pnpm storybook` | Launch Storybook component explorer |
| `pnpm docs:dev` | Start the VitePress documentation site |
| `pnpm docs:build` | Build the documentation site |
| `pnpm size` | Check bundle sizes against limits |
| `pnpm clean` | Remove all build artifacts |

### Releasing

GuideFlow uses [Changesets](https://github.com/changesets/changesets) for versioning:

```bash
# 1. Add a changeset describing your change
pnpm changeset

# 2. Bump versions
pnpm version-packages

# 3. Publish to npm
pnpm publish-packages
```

---

## License

[MIT](LICENSE) © GuideFlow Contributors
