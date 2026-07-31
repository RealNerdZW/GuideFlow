---
description: TourProvider API reference — React context provider that makes a GuideFlow instance available to child components via useGuideFlow(), useTour(), useTourStep() and useHotspot(), and selects which layer draws the popover.
keywords: TourProvider React, GuideFlow React context, useGuideFlow, useTour context, @guideflow/react provider, headless renderer
---

# TourProvider

React context provider that makes a [`GuideFlowInstance`](/api/create-guide-flow) available to
every component below it. All hooks and components in `@guideflow/react` read the instance from
this context.

## Usage

### Let the provider create the instance

```tsx
import { TourProvider } from '@guideflow/react'
import '@guideflow/core/styles'

export function App({ children }: { children: React.ReactNode }) {
  return <TourProvider config={{ debug: true }}>{children}</TourProvider>
}
```

An instance created this way is **destroyed when the provider unmounts** — its document listeners,
injected styles and popover DOM go with it.

### Or supply your own instance

Do this when you need to keep a reference to the instance — for example to call
`gf.createFlow()`, `gf.i18n.use()` or `gf.destroy()` yourself.

```tsx
import { createGuideFlow } from '@guideflow/core'
import { TourProvider } from '@guideflow/react'
import '@guideflow/core/styles'

const gf = createGuideFlow({ debug: true })

export function App({ children }: { children: React.ReactNode }) {
  return <TourProvider instance={gf}>{children}</TourProvider>
}
```

A supplied instance is **never** destroyed by the provider: you own it, so you decide when it dies.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `children` | `ReactNode` | Yes | Subtree that gets access to the instance |
| `config` | `GuideFlowConfig` | No | Passed to `createGuideFlow()` when `instance` is not supplied |
| `instance` | `GuideFlowInstance` | No | An existing instance to share instead of creating one |
| `renderer` | `'core' \| 'react' \| HeadlessRenderer` | No | Which layer draws the popover. Default `'core'`. |

If neither `config` nor `instance` is given, the provider calls `createGuideFlow({})`.

`GuideFlowConfig` accepts `renderer`, `persistence`, `context`, `spotlight`, `nonce`,
`injectStyles` and `debug` — see [`createGuideFlow()`](/api/create-guide-flow). There is no
`theme` or `locale` config field; themes are CSS (`@guideflow/core/styles`) and the locale is set
with `gf.i18n.use(locale)`.

## Choosing who draws the popover

```tsx
// core draws it — the default, and what every existing app already gets
<TourProvider>…</TourProvider>

// React draws it — <GuidePopover> becomes required
<TourProvider renderer="react">
  <App />
  <GuidePopover />
</TourProvider>
```

| Mode | Who draws | `<GuidePopover>` |
|------|-----------|------------------|
| `'core'` (default) | `DefaultRenderer` builds and positions the popover DOM | renders `null`, warns once |
| `'react'` | your React tree | **required** — without it the tour shows a spotlight and no popover |

In `'react'` mode the provider passes a **headless renderer** to `createGuideFlow()`: a
`RendererContract` implementation that stores each step in a subscribable store instead of
touching the DOM. The engine still owns the spotlight, the keyboard handling and the state
machine.

### With your own instance

A renderer can only be chosen when the instance is *created* — `configure({ renderer })` is
ignored by core. So build the instance with your own headless renderer and hand the provider the
same object:

```tsx
import { createGuideFlow } from '@guideflow/core'
import { createHeadlessRenderer, TourProvider, GuidePopover } from '@guideflow/react'

const renderer = createHeadlessRenderer()
const gf = createGuideFlow({ renderer })

<TourProvider instance={gf} renderer={renderer}>
  <App />
  <GuidePopover />
</TourProvider>
```

Passing `renderer="react"` together with `instance` cannot work, so the provider warns and falls
back to core's renderer rather than leaving you with no popover at all.

## `useGuideFlow()`

```tsx
import { useGuideFlow } from '@guideflow/react'

function ResetButton() {
  const gf = useGuideFlow()
  return <button onClick={() => gf.stop()}>Stop tour</button>
}
```

Returns the instance from the nearest provider. **Throws** if called outside a `TourProvider`:

```
[GuideFlow] useGuideFlow must be used inside a <TourProvider>
```

## `useTourRenderer()`

Returns the headless renderer backing the provider, or `null` in `'core'` mode. Use it to build a
popover component of your own:

```tsx
const renderer = useTourRenderer()
const state = useSyncExternalStore(
  renderer?.subscribe ?? (() => () => undefined),
  renderer?.getSnapshot ?? (() => null),
  () => null,
)
// state is { step, content, index, total } | null
// renderer?.dispatch('next' | 'prev' | 'skip' | 'end' | <your FSM event>)
```

## Notes and current limitations

- Place `TourProvider` near the root of your tree, above anything that calls `useTour()`,
  `useTourStep()`, `useHotspot()`, `<TourStep>`, `<GuidePopover>`, `<HotspotBeacon>` or
  `<ConversationalPanel>`.
- **`config` is read once**, on first render. Changing the `config` prop later has no effect. To
  change configuration at runtime, pass an `instance` and call `gf.configure(patch)` on it.
- Changing the `instance` prop swaps the provided instance; the previous one is not destroyed.
- Under React 18 StrictMode the provider is mounted, unmounted and remounted in development. The
  instance it created for the first mount is destroyed and a fresh one is built for the second —
  so the instance you read from context is always live, but do not cache it outside React.
- Every module in this package carries the `'use client'` directive, so importing it from a
  Next.js App Router Server Component is a client-boundary import, not a build error.
