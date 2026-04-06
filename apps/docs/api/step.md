---
description: Step API reference — a step represents a single tooltip, spotlight, or action in a GuideFlow product tour. Learn all configuration options and type definitions.
keywords: GuideFlow Step API, tour step type, tooltip step, spotlight step, step configuration
---

# Step

A step represents a single tooltip, spotlight, or action in a tour.

## Type

```ts
interface Step {
  id: string
  target?: string | Element | null
  content: StepContent | (() => StepContent | Promise<StepContent>)
  placement?: PopoverPlacement
  showIf?: (ctx: unknown) => boolean
  clickThrough?: boolean
  scrollIntoView?: boolean
  actions?: StepAction[]
}
```

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | `string` | — | Unique step identifier (required) |
| `target` | `string \| Element \| null` | `null` | CSS selector or DOM element to anchor to |
| `content` | `StepContent \| () => StepContent` | — | Step content (required) |
| `placement` | `PopoverPlacement` | `'bottom'` | Tooltip position relative to target |
| `showIf` | `(ctx) => boolean` | `undefined` | Conditionally skip this step |
| `clickThrough` | `boolean` | `false` | Allow clicks through the spotlight overlay |
| `scrollIntoView` | `boolean` | `true` | Auto-scroll target into view |
| `actions` | `StepAction[]` | Default buttons | Custom action buttons |

## StepContent

```ts
interface StepContent {
  title?: string
  body?: string
  html?: string
}
```

## StepAction

```ts
interface StepAction {
  label: string
  action: 'next' | 'prev' | 'skip' | 'end' | (string & {})
}
```

## PopoverPlacement

```ts
type PopoverPlacement =
  | 'top' | 'top-start' | 'top-end'
  | 'bottom' | 'bottom-start' | 'bottom-end'
  | 'left' | 'left-start' | 'left-end'
  | 'right' | 'right-start' | 'right-end'
  | 'center'
```

## Examples

### Basic Step

```ts
{ id: 'intro', content: { title: 'Welcome!', body: 'Let us show you around.' }, target: '#app' }
```

### Async Content

```ts
{
  id: 'dynamic',
  content: async () => ({
    title: await fetchGreeting(),
    body: 'Personalised content loaded.',
  }),
  target: '#header',
}
```

### Conditional Step

```ts
{
  id: 'admin-only',
  content: { title: 'Admin Settings' },
  target: '#admin-panel',
  showIf: (ctx) => ctx.roles?.includes('admin'),
}
```
