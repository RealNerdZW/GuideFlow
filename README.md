# GuideFlow.js

**AI-Powered Product Tours. Guide users like you know them.**

[![Build](https://img.shields.io/github/actions/workflow/status/RealNerdZW/GuideFlow/ci.yml?branch=master&label=build)](https://github.com/RealNerdZW/GuideFlow/actions)
[![npm version](https://img.shields.io/npm/v/@guideflow/core.svg)](https://www.npmjs.com/package/@guideflow/core)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@guideflow/core?label=core%20gzip)](https://bundlephobia.com/package/@guideflow/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

GuideFlow is a modular, framework-agnostic product tour library with a built-in finite state machine engine, analytics, and A/B testing. It works with React, Vue, Svelte, or plain JavaScript. AI tour generation and intent detection are opt-in: install `@guideflow/ai` and point it at a model backend you control.

**[Documentation](https://realnerdzw.github.io/GuideFlow/)** · **[Live Demo](https://realnerdzw.github.io/GuideFlow/demo/)** · **[npm](https://www.npmjs.com/package/@guideflow/core)**

---

## Features

- **Zero-dependency core** — the FSM engine, spotlight, and renderer ship without a single runtime dependency
- **Finite state machine tours** — flows are state machines: transitions, guards, context, entry/exit hooks
- **AI tour generation** — generate step sequences from a plain-English prompt. In the browser you point
  `ProxyProvider` at your own endpoint; `OpenAIProvider`, `AnthropicProvider` and `OllamaProvider` talk to
  the service directly and are meant for code where the API key is not shipped to the client
- **Intent detection** — passively monitor user behaviour and surface help when they get stuck
- **Conversational help** — `ConversationalPanel`, a React-only AI chat panel that scrolls the elements an
  answer refers to into view
- **Framework adapters** — React ships hooks *and* components (`TourProvider`, `useTour`, `TourStep`,
  `GuidePopover`, `ConversationalPanel`); Vue 3 ships `GuideFlowPlugin` + a `useTour` composable and Svelte
  ships `createTourStore` — neither of those two ships components, they drive core's own renderer
- **Spotlight overlay** — animated SVG cutout that tracks any element through scroll and resize
- **Persistent progress** — localStorage, IndexedDB, or a custom driver; cross-tab sync via
  BroadcastChannel. Keyed on `context.userId`, so nothing is stored until you set one
- **Analytics** — structured events forwarded to PostHog, Mixpanel, Amplitude, Segment, or a webhook, with
  consent, Do-Not-Track, URL scrubbing and sampling applied before anything leaves the page
- **A/B testing** — deterministic variant assignment with `ExperimentEngine`
- **Hotspots & hints** — persistent pulsing beacons and hint badges independent of tours
- **i18n** — per-instance translation registry with locale fallback
- **CLI** — scaffold starter files, serve a directory over Vite, reformat a flow JSON, POST a flow to your
  own API. Early — read the [CLI](#cli) section before relying on it
- **Strict TypeScript** — full generics, exact optional property types, declaration maps

---

## Packages

| Package | Description | Size |
|---|---|---|
| [`@guideflow/core`](packages/core) | Zero-dependency FSM engine, spotlight, persistence, i18n | 14.96 kB gzip |
| [`@guideflow/react`](packages/react) | `TourProvider`, `useTour`, `useTourStep`, `useHotspot`, `TourStep`, `GuidePopover`, `ConversationalPanel` | — |
| [`@guideflow/vue`](packages/vue) | `GuideFlowPlugin`, `useTour` composable (no components) | — |
| [`@guideflow/svelte`](packages/svelte) | `createTourStore`, `Readable` stores (no components) | — |
| [`@guideflow/ai`](packages/ai) | `GuideBrain`, Proxy / OpenAI / Anthropic / Ollama / Mock providers | — |
| [`@guideflow/analytics`](packages/analytics) | `AnalyticsCollector`, transport adapters, `ExperimentEngine` | — |
| [`@guideflow/cli`](packages/cli) | `init`, `studio`, `export`, `push` commands _(early — see [CLI](#cli))_ | — |
| [`@guideflow/devtools`](packages/devtools) | MV3 browser extension — flow inspector and step recorder. Not published to npm: build it from source and load it unpacked | — |

The core size is what `size-limit` reports for `dist/index.js` bundled, minified and gzipped
(`pnpm --filter @guideflow/core size`) — **14.96 kB against a 15 kB budget**. The published file itself
is unminified, so what you ship depends on your bundler. Four opt-in subpaths sit outside that number
and cost nothing unless imported: `@guideflow/core/targeting` (2.18 kB),
`@guideflow/core/navigation` (1.55 kB), `@guideflow/core/html` (767 B) and
`@guideflow/core/versioning` (336 B).

> The devtools panel discovers a page through the `window.__guideflow` global. The library never sets it —
> assign your instance to it yourself if you want the extension to see your app.

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

Every package takes `@guideflow/core` as a peer dependency, so install it alongside whichever
package you add — that keeps a single copy of the engine in your app.

For AI features:

```bash
# @guideflow/core is a peer dependency — install it alongside.
pnpm add @guideflow/core @guideflow/ai                    # ProxyProvider / OllamaProvider — no SDK needed
pnpm add @guideflow/core @guideflow/ai openai             # OpenAIProvider (server-side)
pnpm add @guideflow/core @guideflow/ai @anthropic-ai/sdk  # AnthropicProvider (server-side)
```

For analytics:

```bash
pnpm add @guideflow/core @guideflow/analytics
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
import type { FlowDefinition } from '@guideflow/vue'
import { useTour } from '@guideflow/vue'

const { start, isActive, currentStepIndex, totalSteps } = useTour()

const flow: FlowDefinition = {
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
  import type { FlowDefinition } from '@guideflow/core'
  import { createGuideFlow } from '@guideflow/core'
  import { createTourStore } from '@guideflow/svelte'
  import '@guideflow/core/styles'

  const store = createTourStore(createGuideFlow())
  const { isActive, currentStepIndex, totalSteps, start } = store

  const flow: FlowDefinition = {
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

GuideFlow's AI layer lives in `@guideflow/ai`. The vendor SDKs are imported lazily inside each provider
method, so only the provider you actually construct pulls its SDK in.

`createAI(provider, instance)` mutates the instance and **returns it retyped with an `.ai` property**. Use
the return value — the `.ai` property does not exist on the `GuideFlowInstance` type.

### Generate a tour from a prompt

In the browser, use `ProxyProvider` and keep the model key on your own server. `OpenAIProvider` and
`AnthropicProvider` hold an API key, and a key in client-side code is public by construction — both warn
on the console when they are constructed with one in a browser.

```ts
import { createGuideFlow } from '@guideflow/core'
import { createAI, ProxyProvider } from '@guideflow/ai'

// Your endpoint receives one POST per call — { kind: 'generateSteps' | 'detectIntent'
// | 'answerQuestion', ...payload } — and calls the model server-side.
const gf = createAI(
  new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
  createGuideFlow(),
)

// Generate steps from a natural-language description of the page
const steps = await gf.ai.generate('Walk me through the checkout flow')
await gf.start({ id: 'ai-tour', initial: 'main', states: { main: { steps, final: true } } })
```

### Calling a model directly

`OpenAIProvider`, `AnthropicProvider` and `MockProvider` are for server-side code, tests, and Node
tooling — anywhere the key is not shipped to a browser. The SDK is a peer dependency of the provider you
choose (`openai`, `@anthropic-ai/sdk`).

```ts
import { createAI, AnthropicProvider } from '@guideflow/ai'

// Node only — reads process.env.ANTHROPIC_API_KEY, model defaults to claude-haiku-4-5
const gf = createAI(new AnthropicProvider(), createGuideFlow())
```

### Local Ollama

`OllamaProvider` needs no key, so it is safe in the browser as long as the Ollama host is reachable.

```ts
import { createAI, OllamaProvider } from '@guideflow/ai'

const gf = createAI(
  new OllamaProvider({ model: 'llama3', baseUrl: 'http://localhost:11434' }),
  createGuideFlow(),
)
```

### Intent detection

Passively watch user behaviour and surface a tour when someone gets stuck. Declare the mapping and
the engine starts the flow for you:

```ts
const gf = createAI(
  new ProxyProvider({ endpoint: '/api/guideflow-ai' }),
  createGuideFlow(),
  {
    autoWatch: true,
    intentTriggers: [
      { type: 'stuck', minConfidence: 0.8, flow: helpFlow },
    ],
  },
)
```

Or subscribe and decide for yourself — triggers are opt-in and off by default:

```ts
const stopWatch = gf.ai.watch()

gf.ai.on('intent:detected', (signal) => {
  // signal.type: 'confused' | 'stuck' | 'exploring' | 'engaged'
  if (signal.type === 'confused' && signal.confidence > 0.8) {
    void gf.start(helpFlow)
  }
})

stopWatch()
```

Every automatic detection is a provider round trip, so the loop is capped: `minEventsBeforeDetect`
(5), `detectCooldownMs` (30s) and `maxDetectsPerSession` (20). `gf.ai.stats` reports what has been
spent. An explicit `detectIntent()` is never capped.

`gf.ai` also exposes `chat(question)`, `detectIntent()`, `compress(steps, instance)`, `clearBuffer()` and
`destroy()`, and emits `steps:generated`, `answer:ready` and `error` alongside `intent:detected`.

### Conversational help panel (React)

```tsx
import { useState } from 'react'
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

> The panel reads `.ai` off the instance in context. Render it under a `TourProvider` whose instance has
> been through `createAI()` — otherwise every question is answered with "AI module not configured".
> Elements the answer references are scrolled into view; they are not spotlit.

---

## Analytics & A/B Testing

### Collect tour events

```ts
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics'

const collector = new AnalyticsCollector({
  userId: 'user-123',
  globalProperties: { plan: 'pro', version: '2.1' },
  // Optional. Defaults are already conservative: Do Not Track is honoured, and
  // query strings and fragments are stripped from any URL that is reported.
  privacy: { consent: false },
})

// …later, once your cookie banner is answered
collector.setConsent(true)

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
| `guideflow.tour.abandoned` | Tour ended without completing (`stop()`, Escape, Skip, backdrop click) |
| `guideflow.step.viewed` | Step is shown (`step:enter`) |
| `guideflow.step.exited` | Step is left (`step:exit`, includes `dwell_ms`) |
| `guideflow.step.skipped` | Step conditionally skipped |

**Available transports:** `PostHogTransport`, `MixpanelTransport`, `AmplitudeTransport`, `SegmentTransport`, `WebhookTransport`

`PostHogTransport`, `MixpanelTransport`, `AmplitudeTransport` and `SegmentTransport` are thin bridges onto
the vendor snippet already on the page (`window.posthog`, `window.mixpanel`, …) — they do not load it for
you and silently no-op when it is absent. `WebhookTransport` POSTs to a URL you own.

### A/B testing

```ts
import { createGuideFlow } from '@guideflow/core'
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine('user-123')

const { value: opacity } = engine.assign({
  id: 'tour-dimming-q1-2025',
  variants: [
    { id: 'control',   value: 0.5, weight: 50 },
    { id: 'treatment', value: 0.8, weight: 50 },
  ],
})

// Assignment is deterministic — the same userId always gets the same variant
const gf = createGuideFlow({ spotlight: { overlayOpacity: opacity } })
```

`assign()` returns `{ experimentId, variantId, value }` and caches per experiment id. `peek()` computes an
assignment without caching it; `reset()` clears the cache when the user identity changes. There is no
built-in exposure event — forward `variantId` to your analytics yourself.

---

## Configuration Reference

### `GuideFlowConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `renderer` | `RendererContract` | `DefaultRenderer` | Custom step renderer |
| `persistence` | `PersistenceConfig` | `undefined` | Progress persistence settings |
| `context` | `GuidanceContext` | `{}` | Shared context passed to steps and guards |
| `spotlight` | `SpotlightOptions` | `{}` | Spotlight overlay options |
| `nonce` | `string` | `undefined` | CSP nonce for the styles injected by the renderer, hotspots and hints |
| `injectStyles` | `boolean` | `true` | Auto-inject the renderer's default popover CSS. The spotlight, hotspot and hint stylesheets are injected regardless — this flag only governs the popover |
| `debug` | `boolean` | `false` | Enable debug logging |

Under a strict CSP, set the nonce in **both** places: `config.nonce` covers the renderer, hotspot and hint
styles; the spotlight overlay reads `spotlight.nonce` and nothing else.

### `SpotlightOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `padding` | `number` | `8` | Padding around highlighted element (px) |
| `borderRadius` | `number` | `4` | Corner radius of spotlight cutout (px) |
| `animated` | `boolean` | `true` | Animate spotlight transitions |
| `overlayColor` | `string` | `'#000'` | Overlay background color |
| `overlayOpacity` | `number` | `0.5` | Overlay opacity (0–1) |
| `dismissOnBackdropClick` | `boolean` | `true` | Clicking the dimmed area dismisses the tour |
| `nonce` | `string` | `undefined` | CSP nonce for the overlay's injected styles |

### `PersistenceConfig`

| Option | Type | Default | Description |
|---|---|---|---|
| `driver` | `'localStorage' \| 'indexedDB' \| PersistenceDriver` | `'localStorage'` | Storage backend |
| `key` | `(userId: string) => string` | Built-in | Custom storage key factory |
| `ttl` | `number` | `2592000000` (30 days) | Progress expiry in milliseconds. `0` or `Infinity` means never expire |

Persistence is keyed on `context.userId`. With no `userId` set, nothing is written, nothing is resumed, and
`persistDismissal` has no effect. A resumed tour re-renders at the saved step; a flow the user already
completed or dismissed is suppressed rather than restarted.

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
| `target` | `string \| HTMLElement \| null` | CSS selector or element to anchor to. Omit or pass `null` for a centred, unanchored step |
| `content` | `StepContent \| (() => MaybePromise<StepContent>)` | `{ title?, body?, html? }`, or a function returning it — the function may be async |
| `placement` | `PopoverPlacement` | One of the 13 values below |
| `showIf` | `(ctx: TContext) => boolean` | Step is skipped when this returns `false` |
| `padding` | `number` | Spotlight padding for this step only, in px |
| `clickThrough` | `boolean` | Allow clicks to pass through the spotlight |
| `scrollIntoView` | `boolean` | Auto-scroll target into view (default `true`) |
| `actions` | `StepAction[]` | Override default next/prev/skip buttons |
| `meta` | `Record<string, unknown>` | Free-form metadata for analytics/AI |

**`PopoverPlacement` values:** `top`, `top-start`, `top-end`, `bottom`, `bottom-start`, `bottom-end`, `left`, `left-start`, `left-end`, `right`, `right-start`, `right-end`, `center`

`content.html` needs an opt-in import — the sanitiser is not in the default bundle, because it is
~420 B that consumers using `content.body` were paying for and never using:

```ts
import { sanitizeHTML } from '@guideflow/core/html'
const gf = createGuideFlow({ sanitizeHTML })
```

It then filters against an allowlist: `<svg>`, `<iframe>`, `<style>`, `style=` attributes and custom
elements are removed. **Without it, `content.html` is escaped and rendered as text** and the renderer
warns once. Use `title`/`body` unless you need inline markup — those are plain text and involve no
sanitiser.

---

## Instance API

| Member | Signature | Notes |
|---|---|---|
| `start` | `(flow: FlowDefinition \| string, ctx?) => Promise<void>` | A string looks up a flow registered with `createFlow`. Warns and returns if unknown |
| `stop` | `() => void` | Ends the tour without completing it — emits `tour:abandon` |
| `skip` | `() => void` | The user-dismissal path: `step:skip` → `tour:dismiss` → `tour:abandon` |
| `next` / `prev` | `() => Promise<void>` | Move within the state, crossing state boundaries when the steps run out |
| `goTo` | `(stepId: string) => Promise<void>` | Jump to a step by id, in any state of the flow |
| `send` | `(event: string) => Promise<void>` | Fire a transition from the current state's `on` table |
| `pause` / `resume` | `() => void` | Hide/restore the UI without abandoning the flow |
| `configure` | `(patch: Partial<GuideFlowConfig>) => void` | Applies at any time. `renderer` is the exception — it is fixed at construction and a patch is warned about and ignored |
| `createFlow` / `listFlows` | — | Register a flow by id / list the registered ones |
| `i18n` | `I18nRegistry` | `gf.i18n.register(locale, strings)`, `gf.i18n.use(locale)`. Per-instance, and pushed into the renderer |
| `progress` | `ProgressStore` | Snapshot/completion/dismissal storage |
| `destroy` | `() => void` | Tears down the tour, hotspots, hints and the cross-tab channel |

Read-only: `isActive`, `currentStepId`, `currentStepIndex`, `totalSteps`, `currentStep`, `currentContent`.
`currentStepIndex` and `totalSteps` are scoped to the **current state**, not the whole flow — a flow split
across three states reports "1 of 2", then "1 of 1".

---

## Flow Definition (State Machine)

GuideFlow tours are finite state machines. Each state holds an array of steps; events trigger transitions.
`next()` walks the steps of the current state and, when they run out, follows the transition table. A flow
with no `final: true` state never emits `tour:complete`.

```ts
import { createGuideFlow, type GuidanceContext } from '@guideflow/core'

interface OnboardingContext extends GuidanceContext {
  completedSteps: number
}

const gf = createGuideFlow<OnboardingContext>({
  context: { userId: 'u1', roles: ['admin'], completedSteps: 0 },
})

const onboardingFlow = gf.createFlow({
  id: 'onboarding',
  initial: 'setup',
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

A flat `{ id, steps: [...] }` object is **not** a flow — `start()` needs `initial` and `states`.

`FlowDefinition` also accepts:

| Field | Type | Description |
|---|---|---|
| `context` | `TContext` | Fallback context, used **only** when no context is passed to `createGuideFlow()` or `start(flow, ctx)`. Those two win over it |
| `persistDismissal` | `boolean` | When `true`, a user who dismisses this flow never sees it again. Requires `context.userId`. Off by default |

`StateNode` fields are `steps`, `on` (event → state, optionally `{ target, guard, actions }`), `onEntry`,
`onExit` and `final`.

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

Hotspot and hint clicks are not observable from the instance today — see [Events](#events).

---

## Events

`GuideFlowInstance` is an event emitter. Subscribe to any tour lifecycle event:

```ts
gf.on('tour:start',    ({ flowId }) => console.warn('Tour started:', flowId))
gf.on('tour:complete', ({ flowId }) => console.warn('Tour completed:', flowId))
gf.on('tour:dismiss',  ({ flowId, stepId, stepIndex }) => { /* user pressed Escape / Skip / backdrop */ })
gf.on('tour:abandon',  ({ flowId, stepId, stepIndex }) => { /* ended without completing */ })
gf.on('tour:pause',    ({ flowId, stepId }) => { /* ... */ })
gf.on('tour:resume',   ({ flowId, stepId }) => { /* ... */ })
gf.on('tour:error',    ({ flowId, stepId, error }) => { /* ... */ })
gf.on('step:enter',    ({ stepId, stepIndex, target }) => { /* ... */ })
gf.on('step:exit',     ({ stepId, stepIndex }) => { /* ... */ })
gf.on('step:skip',     ({ stepId }) => { /* ... */ })

// All .on() calls return an unsubscribe function
const off = gf.on('tour:complete', handler)
off() // unsubscribe
```

A tour either completes or is abandoned, never both. `tour:dismiss` is the user-initiated subset of
abandonment (Escape, the Skip button, a backdrop click); it is preceded by `step:skip` and followed by
`tour:abandon`. `gf.stop()` emits `tour:abandon` on its own.

The ten events above are the ones the instance emits. `TourEvents` also declares `hotspot:open`,
`hotspot:close`, `hint:click` and `progress:sync` — those are raised on internal subsystems (the hotspot
manager, the hint system, the cross-tab channel) that the instance does not re-emit, so subscribing to
them on `gf` type-checks but never fires. `hotspot:close` has no emitter at all.

---

## CLI

Install the CLI globally or use it via `pnpm exec`:

```bash
pnpm add -g @guideflow/cli
```

> **Early and incomplete.** There is no visual tour editor yet, `export` only produces a usable file
> from JSON input, and `push` needs an API you host yourself. The table below says what each command
> does today, not what it is named after.

| Command | What it actually does |
|---|---|
| `guideflow init` | Writes `guideflow.ts`, `my-tour.ts` (+ `GuideFlowProvider.tsx` for React) into a directory. Always prompts; no config file is created |
| `guideflow studio` | Serves your project with Vite on `127.0.0.1:4747` and injects `window.__GUIDEFLOW_DEVTOOLS__` — a flag nothing currently reads. Vite is an optional peer, install it yourself |
| `guideflow export` | Reformats a `.json` flow (pass `-o`, or it overwrites the input). For `.ts`/`.js` it writes a truncated raw-source stub, **not** a `FlowDefinition` |
| `guideflow push` | POSTs a flow JSON file to `--endpoint`. `--api-key` is required. The default endpoint `https://api.guideflow.dev/v1/flows` is a placeholder for a service that does not exist |

Full reference, including every flag and default: [apps/docs/api/cli.md](apps/docs/api/cli.md).

---

## Intro.js / Driver.js Migration

GuideFlow includes an attribute scanner in the same spirit as Intro.js, but it reads **its own**
attributes. Intro.js's `data-intro`, `data-step` and `data-position` are not recognised — rename them.

| Attribute | Meaning |
|---|---|
| `data-gf-step` | Required. Numeric order of the step; elements are sorted by it |
| `data-gf-title` | Popover title |
| `data-gf-body` | Popover body |
| `data-gf-placement` | A `PopoverPlacement` value. Defaults to `bottom` |
| `data-gf-show-if` | A dot-notation context path, e.g. `featureFlags.showTour`. The step is skipped when it resolves falsy. Anything that is not a plain property path is rejected with a warning |

```html
<div data-gf-step="1" data-gf-title="Dashboard" data-gf-body="Welcome to the dashboard">...</div>
<div data-gf-step="2" data-gf-body="Your profile lives here" data-gf-placement="right">...</div>
```

```ts
import { autoInit } from '@guideflow/core'

// Scans the document for data-gf-step elements and starts the resulting tour
autoInit()
```

`autoInit()` is a one-shot convenience wrapper. For control over the instance, call
`scanAttributeTour()` yourself — it returns a `FlowDefinition | null` — or `watchAttributeTour(cb)` to
rescan as the DOM changes.

Step-by-step API mappings: [Migrating from Intro.js](apps/docs/guide/migrate-intro.md) ·
[Migrating from Driver.js](apps/docs/guide/migrate-driver.md).

---

## Contributing

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 8 (`npm install -g pnpm`)

### Setup

```bash
git clone https://github.com/RealNerdZW/GuideFlow.git
cd GuideFlow
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
| `pnpm clean` | Remove build artifacts **and** `node_modules` — re-run `pnpm install` afterwards |

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

[MIT](LICENSE) © 2026 John Mugabe
