---
description: GuidePopover API reference — React portal popover that mirrors the active GuideFlow step. Documents its real props (width, className, children) and its current limitations.
keywords: GuidePopover component, React portal popover, GuideFlow popover, custom tour popover React
---

# GuidePopover

A React popover that mirrors the **active tour step**. It subscribes to `step:enter` on the
instance from [`TourProvider`](/api/react/tour-provider) and renders a `role="dialog"` panel into
`document.body` through a portal.

::: warning Not production-ready yet
This component is an experiment and overlaps with the core renderer. Read
[Current limitations](#current-limitations) before adopting it. If you just want a working tour,
mount nothing — core's default renderer already draws the popover.
:::

It is **not** a standalone tooltip. It requires a `TourProvider` (it calls `useGuideFlow()`, which
throws outside one) and it renders `null` unless a tour step is active.

## Usage

```tsx
import { TourProvider, GuidePopover } from '@guideflow/react'

export function App({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider config={{ debug: true }}>
      {children}
      <GuidePopover />
    </TourProvider>
  )
}
```

### Custom body

`children` replaces the whole default layout — header, body and footer. Supply your own
navigation buttons when you use it.

```tsx
import { GuidePopover, useGuideFlow } from '@guideflow/react'

function MyPopover() {
  const gf = useGuideFlow()
  return (
    <GuidePopover width={400}>
      {({ content, index, total }) => (
        <div className="my-popover">
          <h2>{content.title}</h2>
          <p>{content.body}</p>
          <span>{index + 1} / {total}</span>
          <button onClick={() => void gf.next()}>Next</button>
        </div>
      )}
    </GuidePopover>
  )
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `width` | `number` | No | Popover width in pixels. Default `320`. |
| `className` | `string` | No | Appended to the built-in `gf-popover` class |
| `children` | `ReactNode \| ((props: { step: Step; content: StepContent; index: number; total: number }) => ReactNode)` | No | Replaces the default layout entirely |

There is no `target`, `placement` or `content` prop. The anchor comes from the active step's
`target`, and the placement from that step's `placement` field in the
[`FlowDefinition`](/api/flow-definition). When the active step has no target, the popover is
centred in the viewport.

## Default layout

When `children` is omitted the component renders a progress bar (only when `total > 1`), the
step title as `<h2>`, a close button, the step body as `<p>`, a "Step n of m" label and
skip / back / next buttons. Titles and bodies are rendered as React text nodes, so they are
escaped automatically.

## Current limitations

These are real defects in the shipped component, not design choices.

1. **It draws a second popover.** Core's `DefaultRenderer` still renders its own popover for the
   same step, so mounting `GuidePopover` on a default instance gives you two stacked dialogs.
   Suppressing core's popover requires passing your own `renderer` (a `RendererContract`
   implementation) to `createGuideFlow()` — there is no built-in headless renderer. The spotlight
   is owned by the engine, not the renderer, so it keeps working either way.
2. **It ignores `step.actions`, `content.html` and `step.media`.** The footer is hard-coded to
   skip / back / next. Flows that define custom action buttons — which core's renderer honours —
   render the wrong buttons here, and their FSM events become unreachable.
3. **Its strings do not follow `gf.i18n`.** The button labels read from the module-level
   `defaultI18n` singleton, so `gf.i18n.use('fr')` has no effect on them. As a workaround,
   register and select the locale on the singleton before the tour starts:
   ```ts
   import { defaultI18n } from '@guideflow/core'

   defaultI18n.register('fr', { next: 'Suivant', prev: 'Retour', done: 'Terminé' })
   defaultI18n.use('fr')
   ```
   Changing the locale does not re-render an already-visible popover.
4. **Position is computed after the first paint and is not tracked on scroll.** The popover is
   measured in an effect, so it can flash at the top-left corner for one frame, and it only
   repositions on `window resize` — not on scroll or target movement.

## Requirements

Must be rendered inside a [`<TourProvider>`](/api/react/tour-provider). Import
`@guideflow/core/styles` (or your own CSS) for the `gf-popover` classes.
