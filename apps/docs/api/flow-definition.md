---
description: FlowDefinition API reference — describes a complete GuideFlow tour as a finite state machine. Learn the full type signature, required fields, and options.
keywords: FlowDefinition API, GuideFlow flow type, tour definition schema, FSM tour config
---

# FlowDefinition

A flow definition describes a complete tour as a finite state machine.

## Type

```ts
interface FlowDefinition<TContext = Record<string, unknown>> {
  id: string
  initial: string
  context?: TContext
  states: Record<string, FlowState<TContext>>
}
```

## FlowState

```ts
interface FlowState<TContext> {
  steps: Step[]
  on?: Record<string, string | TransitionConfig<TContext>>
  onEntry?: (ctx: TContext) => void
  onExit?: (ctx: TContext) => void
  final?: boolean
}
```

## TransitionConfig

```ts
interface TransitionConfig<TContext> {
  target: string
  guard?: (ctx: TContext) => boolean
}
```

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique flow identifier |
| `initial` | `string` | Yes | Name of the starting state |
| `context` | `TContext` | No | Initial context data |
| `states` | `Record<string, FlowState>` | Yes | Map of state names to state definitions |

### FlowState Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `steps` | `Step[]` | Yes | Steps shown in this state |
| `on` | `Record<string, string \| TransitionConfig>` | No | Event → target state transitions |
| `onEntry` | `(ctx) => void` | No | Called when entering this state |
| `onExit` | `(ctx) => void` | No | Called when leaving this state |
| `final` | `boolean` | No | If `true`, the tour ends after this state's steps |

## Example

```ts
const flow: FlowDefinition<{ role: string }> = {
  id: 'onboarding',
  initial: 'welcome',
  context: { role: 'user' },
  states: {
    welcome: {
      steps: [{ id: 'hi', content: { title: 'Hello!' }, target: '#app' }],
      on: {
        NEXT: {
          target: 'admin',
          guard: (ctx) => ctx.role === 'admin',
        },
      },
    },
    admin: {
      steps: [{ id: 'admin', content: { title: 'Admin panel' }, target: '#admin' }],
      final: true,
    },
  },
}
```
