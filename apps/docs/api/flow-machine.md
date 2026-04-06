---
description: FlowMachine API reference — GuideFlow's internal finite state machine that powers flow execution, state transitions, and context management between tour steps.
keywords: FlowMachine API, GuideFlow FSM, flow state transitions, createMachine
---

# FlowMachine

The `FlowMachine` is GuideFlow's internal finite state machine implementation. It powers flow execution, transitions, and context management.

## createMachine()

```ts
import { createMachine } from '@guideflow/core'

const machine = createMachine({
  id: 'my-flow',
  initial: 'idle',
  context: { count: 0 },
  states: {
    idle: {
      on: { START: 'running' },
    },
    running: {
      on: {
        NEXT: {
          target: 'done',
          guard: (ctx) => ctx.count > 0,
        },
      },
      onEntry: (ctx) => { ctx.count++ },
    },
    done: { final: true },
  },
})
```

## Machine API

| Method | Description |
|--------|-------------|
| `send(event)` | Send an event to trigger a transition |
| `getState()` | Get the current state name |
| `getContext()` | Get the current context |

## Transitions

Transitions fire when an event is sent and (optionally) a guard passes:

```ts
machine.send('START')    // idle → running
machine.send('NEXT')     // running → done (if guard passes)
```

## Guards

Guards are functions that receive the context and return a boolean:

```ts
guard: (ctx) => ctx.userRole === 'admin'
```

If the guard returns `false`, the transition is blocked.

## Lifecycle Hooks

| Hook | When |
|------|------|
| `onEntry(ctx)` | Entering a state |
| `onExit(ctx)` | Leaving a state |

Both hooks receive a mutable reference to the context, so changes persist.
