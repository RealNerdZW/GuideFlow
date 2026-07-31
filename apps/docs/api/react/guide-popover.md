---
description: GuidePopover API reference — the React-rendered tour popover. Requires renderer="react" on TourProvider; documents its props, default layout, custom children and the one core feature it degrades.
keywords: GuidePopover component, React portal popover, GuideFlow popover, headless renderer React, custom tour popover React
---

# GuidePopover

Renders the **active tour step** as a popover, through a React portal into `document.body`.

::: warning It only draws in `renderer="react"` mode
Something has to own the popover, and by default that is core's `DefaultRenderer`. Mount
`<GuidePopover>` under `<TourProvider renderer="react">`; under the default `renderer="core"` it
renders `null` and warns once in the console, because drawing here as well would put **two**
`aria-modal` dialogs on the page.
:::

It is **not** a standalone tooltip. It requires a [`TourProvider`](/api/react/tour-provider) (it
calls `useGuideFlow()`, which throws outside one) and it renders `null` unless a tour step is on
screen.

## Usage

```tsx
import { TourProvider, GuidePopover } from '@guideflow/react'
import '@guideflow/core/styles'

export function App({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider renderer="react" config={{ debug: true }}>
      {children}
      <GuidePopover />
    </TourProvider>
  )
}
```

In `renderer="react"` mode **`<GuidePopover>` (or your own component) must be mounted**, or the
tour runs with a spotlight and no popover. The spotlight overlay belongs to the engine, not to the
renderer, so it appears either way.

The `gf-popover` class names come from `@guideflow/core/styles`; the React package ships no CSS of
its own.

### Custom body

`children` replaces the whole default layout — progress bar, header, body and footer. The render
prop hands you everything you need, including navigation, so you do not have to call
`useGuideFlow()` yourself.

```tsx
<GuidePopover width={400}>
  {({ content, index, total, next, prev, skip }) => (
    <div className="my-popover">
      <h2>{content.title}</h2>
      <p>{content.body}</p>
      <span>{index + 1} / {total}</span>
      <button onClick={prev}>Back</button>
      <button onClick={next}>Next</button>
      <button onClick={skip}>Skip</button>
    </div>
  )}
</GuidePopover>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `width` | `number` | No | Popover width in pixels. Default `320`. |
| `className` | `string` | No | Appended to the built-in `gf-popover` class |
| `children` | `ReactNode \| ((props: GuidePopoverRenderProps) => ReactNode)` | No | Replaces the default layout entirely |

`GuidePopoverRenderProps` is:

| Field | Type | Description |
|-------|------|-------------|
| `step` | `Step` | The active step from the flow definition |
| `content` | `StepContent` | Resolved content (async `content` functions are already awaited) |
| `index` / `total` | `number` | Position within the current state |
| `next` / `prev` / `skip` / `close` | `() => void` | Navigation, routed through core's action handler |
| `dispatch` | `(action: string) => void` | Any action string — `next`, `prev`, `skip`, `end`, or an FSM event name |

There is no `target`, `placement` or `content` prop. The anchor comes from the active step's
`target`, and the placement from that step's `placement` field in the
[`FlowDefinition`](/api/flow-definition). When the active step has no target, the popover is
centred in the viewport.

## Default layout

With no `children` it renders, in order: a progress bar and a "Step n of m" label (both only when
the current state has more than one step), the title as `<h2>`, a close button, `step.media` if
present, the body, then a Skip button followed by the step's actions.

- **`step.actions` are honoured.** When a step defines them, they replace the default Back/Next
  pair, and each one's `action` string is dispatched through the same handler core uses — so
  custom FSM event names work.
- **The final button dispatches `next`, not `end`.** That ends the tour through the *completed*
  path, so `tour:complete` fires and persistence records the flow as finished. (Core's own
  renderer dispatches `end` there, which reports the tour as abandoned.)
- **Titles and bodies are React text nodes**, so they are escaped automatically.
- **Button labels follow `gf.i18n`**, the registry on the instance from the provider — not the
  `defaultI18n` singleton. Register and select a locale before the step renders; changing the
  locale does not re-render a popover that is already on screen.

## Positioning

Measured and placed in a layout effect, before the browser paints, and re-positioned on capture-
phase `scroll` and on `resize`. It is hidden until it has been measured, so it never flashes at the
top-left corner.

## Known limitation: `content.html`

`content.html` is rendered as **plain text**, with its markup stripped. Core's sanitiser is
internal and is not exported from `@guideflow/core`, so there is no safe way for this component to
mount raw HTML, and it will not ship an unsanitised `dangerouslySetInnerHTML` path. For rich
content use the `children` render prop, or let core's renderer draw the popover.

## Accessibility

The popover is a `role="dialog" aria-modal="true"` panel. Focus moves into it on every step and is
returned to the previously focused element when the tour ends or pauses. It does **not** yet trap
focus or mark the background `inert` — that is tracked in the accessibility phase of the
remediation plan.

## Requirements

Must be rendered inside a [`<TourProvider>`](/api/react/tour-provider) with `renderer="react"`.
Import `@guideflow/core/styles` (or your own CSS) for the `gf-popover` classes.
