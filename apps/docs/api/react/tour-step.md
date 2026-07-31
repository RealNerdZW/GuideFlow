---
description: TourStep API reference — React component that renders its children only while a named tour step is active. Use it to attach custom UI to a step.
keywords: TourStep component, GuideFlow tour step React, conditional step rendering, render prop tour step
---

# TourStep

Renders its `children` only while the step with the matching `id` is the active step, and renders
`null` the rest of the time.

::: warning What this component is not
`TourStep` does **not** draw a popover, does not manage the spotlight, and does not register a
step with the engine. The popover and spotlight are drawn by the core renderer; the step itself
must exist in your [`FlowDefinition`](/api/flow-definition). `TourStep` is a visibility switch
keyed on `step:enter` / `step:exit`.
:::

## Usage

```tsx
import { TourStep } from '@guideflow/react'

function Dashboard() {
  return (
    <TourStep id="hello">
      <div className="confetti" />
    </TourStep>
  )
}
```

The `id` must match a step id in the running flow:

```ts
states: {
  intro: {
    steps: [{ id: 'hello', target: '#sidebar', content: { title: 'Sidebar', body: 'Start here.' } }],
    final: true,
  },
}
```

### Render prop

Pass a function to get navigation callbacks:

```tsx
<TourStep id="hello">
  {({ next, prev }) => (
    <div className="my-step-controls">
      <button onClick={prev}>Back</button>
      <button onClick={next}>Continue</button>
    </div>
  )}
</TourStep>
```

The render prop receives `{ next: () => void; prev: () => void; isActive: boolean }`. `next` and
`prev` are fire-and-forget wrappers around the instance's async `next()` / `prev()`. Because the
function only runs while the step is active, `isActive` is always `true` inside it.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | `string` | Yes | Step id to track — must match a step in the `FlowDefinition` |
| `children` | `ReactNode \| ((props: { next: () => void; prev: () => void; isActive: boolean }) => ReactNode)` | No | Content, or a render prop. With no children the component always renders `null`. |

## Notes

- Must be rendered inside a [`<TourProvider>`](/api/react/tour-provider).
- Visibility resets to hidden on `step:exit`, `tour:abandon` and `tour:complete`.
- Several `TourStep` components with different ids can be mounted at once; each tracks its own id.
- To get the same `isActive` flag without wrapping children — plus a ref you can attach to your
  own element for styling — use the `useTourStep(stepId)` hook instead.
