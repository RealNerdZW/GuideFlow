---
description: TourProvider API reference — React context provider that makes a GuideFlow instance available to child components via useGuideFlow(), useTour(), useTourStep() and useHotspot().
keywords: TourProvider React, GuideFlow React context, useGuideFlow, useTour context, @guideflow/react provider
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

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `children` | `ReactNode` | Yes | Subtree that gets access to the instance |
| `config` | `GuideFlowConfig` | No | Passed to `createGuideFlow()` when `instance` is not supplied |
| `instance` | `GuideFlowInstance` | No | An existing instance to share instead of creating one |

If neither `config` nor `instance` is given, the provider calls `createGuideFlow({})`.

`GuideFlowConfig` accepts `renderer`, `persistence`, `context`, `spotlight`, `nonce`,
`injectStyles` and `debug` — see [`createGuideFlow()`](/api/create-guide-flow). There is no
`theme` or `locale` config field; themes are CSS (`@guideflow/core/styles`) and the locale is set
with `gf.i18n.use(locale)`.

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

## Notes and current limitations

- Place `TourProvider` near the root of your tree, above anything that calls `useTour()`,
  `useTourStep()`, `useHotspot()`, `<TourStep>`, `<GuidePopover>`, `<HotspotBeacon>` or
  `<ConversationalPanel>`.
- **`config` is read once**, on first render. Changing the `config` prop later has no effect. To
  change configuration at runtime, pass an `instance` and call `gf.configure(patch)` on it.
- **The provider never destroys the instance it creates.** There is no unmount cleanup, so an
  instance created from `config` outlives the provider along with its listeners and injected DOM.
  If your provider mounts and unmounts repeatedly, create the instance yourself, pass it as
  `instance`, and call `gf.destroy()` in your own cleanup.
- Changing the `instance` prop swaps the provided instance; the previous one is not destroyed.
