# @guideflow/core

**Zero-dependency FSM engine for product tours, spotlights, hotspots, and hints.**

[![npm version](https://img.shields.io/npm/v/@guideflow/core.svg)](https://www.npmjs.com/package/@guideflow/core)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@guideflow/core?label=gzip)](https://bundlephobia.com/package/@guideflow/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

The core engine behind [GuideFlow](https://github.com/RealNerdZW/GuideFlow). Framework-agnostic — use it with vanilla JS or pair it with `@guideflow/react`, `@guideflow/vue`, or `@guideflow/svelte`.

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

## Subpath entry points

The main entry carries the engine and nothing else. Every other concern is a separate entry point
that costs nothing until you import it, and each is gated independently by `size-limit` — **seven
bundles, seven budgets** (`pnpm --filter @guideflow/core size`):

| Import | Gzipped | Budget | What it is |
|---|---|---|---|
| `@guideflow/core` | 14.96 kB | 15 kB | The engine: `createGuideFlow()`, FSM, spotlight, renderer, persistence, i18n |
| `@guideflow/core/authoring` | 5.3 kB | 5.5 kB | `validateFlow()` and the `.flow.json` format. Authoring-time only |
| `@guideflow/core/targeting` | 2.18 kB | 2.5 kB | `createTargeting()` — audience, schedule and frequency rules |
| `@guideflow/core/selector` | 1.76 kB | 2.5 kB | `buildSelector()` — turn an element into a selector that survives a deploy |
| `@guideflow/core/navigation` | 1.55 kB | 2 kB | `createNavigation()`, `waitForElement()` — SPA route changes |
| `@guideflow/core/html` | 767 B | 1 kB | `sanitizeHTML`, passed as `createGuideFlow({ sanitizeHTML })` for `content.html` |
| `@guideflow/core/versioning` | 336 B | 500 B | `flowFingerprint()` / `withFingerprint()` — content-hash a flow |

`authoring` and `selector` are **authoring-time** entry points: a running app never validates a flow
and never builds a selector. Nothing in `src/index.ts` imports either, so neither can reach an
application bundle unless you import it yourself.

### `@guideflow/core/selector`

Turns an element into a CSS selector `document.querySelector` can find again. Strategies are tried
in order — `[data-gf-id]`, test-id attributes, `id`, `name`, `aria-label`, `href`, then structural —
and **every candidate is verified by re-query before it is accepted**.

```ts
import { buildSelector } from '@guideflow/core/selector'

const result = buildSelector(document.querySelector('#save')!)
// { selector: '[data-testid="save"]', strategy: 'testid', confidence: 'stable',
//   unique: true, matchCount: 1, element, warnings: [] }

if (!result.unique) {
  // Nothing resolved to exactly one element — refuse the step rather than ship it.
}
```

`confidence` is `'stable' | 'semantic' | 'fragile'`. `warnings` reports why a selector might rot:
`'generated-id'` (a framework-generated `id` such as React's `useId`, which is rejected rather than
emitted), `'i18n-fragile'`, `'positional'`, `'not-unique'`, `'redacted'`, `'retargeted'`,
`'shadow-dom'`.

Add `data-gf-id` to anything you intend a tour to point at — it is an opt-in hook that wins outright
over every other strategy:

```html
<button data-gf-id="save-invoice">Save</button>
```

An element inside a shadow root returns `unique: false` and a `'shadow-dom'` warning, because
`TourEngine` resolves targets with `document.querySelector`, which cannot cross a shadow boundary.

Also exported: `verifySelector(selector, el, root?)` → `'unique' | 'ambiguous' | 'no-match' |
'invalid'`, `isStableId(id)`, and `retargetToInteractive(el, maxClimb?)` — which walks up from an
icon or a `<path>` to the button that actually handles the click.

### `@guideflow/core/authoring`

Validates a `FlowDefinition` and reads/writes the `.flow.json` file format. It **never repairs a
flow and never throws** for a validation problem — it reports.

```ts
import { validateFlow, stringifyFlowFile } from '@guideflow/core/authoring'

const { valid, errors, warnings } = validateFlow(flow)
for (const issue of [...errors, ...warnings]) {
  console.warn(`${issue.path}: ${issue.message}`)
  console.warn(`  → ${issue.hint}`)
}

if (valid) await writeFile('welcome.flow.json', stringifyFlowFile(flow))
```

A `FlowIssue` is `{ code, severity: 'error' | 'warning', path, message, hint, stateId?, stepId? }`.
Severities are set by what the engine measurably does: a transition naming a state that does not
exist is an **error** (one `console.warn`, then `tour:complete` — the tour truncates *and* is marked
complete, so it never shows again), while a flow with no `final: true` state is only a **warning**
(it completes normally).

The file format is `{ gfFlowFile: 1, flow, meta? }`. There is deliberately no `$schema` key — we host
no schema, and a URL that 404s would be a lie inside the artifact. `validateFlow` *is* the schema.
`stringifyFlowFile` stamps `flow.version` via `withFingerprint` unless one is already set, and throws
if the flow contains a function, `RegExp` or `Date` — a file that silently dropped a `showIf` would
mean something different from the flow it came from.

Reading one back needs no loader:

```ts
import doc from './welcome.flow.json'
await gf.start(doc.flow)
```

Also exported: `parseFlowFile()`, `draftToFlow()`, `flowToDraft()`, `explainNotLinear()`, and the
types `FlowIssue`, `FlowIssueCode`, `FlowValidation`, `LinearStep`, `FlowDraft`, `FlowFile`,
`FlowFileMeta`, `Severity`. `guideflow validate <files...>` from `@guideflow/cli` is the same
validator behind a CI-friendly exit code.

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

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
