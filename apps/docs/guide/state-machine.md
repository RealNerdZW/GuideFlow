---
description: GuideFlow tours are powered by a finite state machine (FSM). Full control over branching, looping, and conditional flows. Learn how states and transitions work.
keywords: GuideFlow state machine, finite state machine tour, FSM product tour, branching tour flows
---

# State Machine

GuideFlow tours are powered by a finite state machine. Each tour is a graph of
**states** connected by **transitions**, which is what makes branching and
conditional flows possible.

## Core Concepts

- **State** — a named node in the graph. A state may hold steps, transitions,
  entry/exit hooks, or none of those.
- **Transition** — an event name mapped to a target state.
- **Guard** — a predicate that must return `true` for a transition to fire.
- **Context** — one mutable object shared by guards, `showIf` predicates and
  hooks for the lifetime of the tour.

## Basic Example

```ts
const flow = gf.createFlow({
  id: 'checkout-tour',
  initial: 'cart',
  states: {
    cart: {
      steps: [{ id: 'cart-intro', content: { title: 'Your cart' }, target: '#cart' }],
      on: { NEXT: 'payment' },
    },
    payment: {
      steps: [{ id: 'pay-step', content: { title: 'Payment' }, target: '#payment-form' }],
      on: { NEXT: 'confirm' },
    },
    confirm: {
      steps: [{ id: 'done', content: { title: 'All set!' }, target: '#confirm-btn' }],
      final: true,
    },
  },
})
```

## How the machine advances

`gf.next()` advances the step index inside the current state. When the current
state has no further steps it automatically sends the event **`NEXT`** — that is
why the example above wires `on: { NEXT: … }`. Any other event name must be sent
explicitly with `gf.send('EVENT')`.

`gf.prev()` walks backwards inside the state and, at index 0, walks the visited
history back to the most recent earlier state that has steps, landing on its
last step. `gf.goTo(stepId)` searches every state in the flow, not just the
current one.

## When a tour completes

`tour:complete` fires when there is **nothing left to render**: the last step of
a state that has no matching transition. It is not triggered by `final: true` —
`final` is metadata, surfaced as `machine.isFinal` for tooling, and the engine
never reads it. Steps belonging to a `final: true` state are rendered normally
before the tour ends.

Ending a tour any other way — `gf.stop()`, `gf.skip()`, Escape, the Skip button,
a backdrop click — emits `tour:abandon` instead.

## Transitions

Transitions live under `on`. Each key is an event name; each value is either a
target state id or a transition object:

```ts
on: {
  NEXT: 'payment',
  SKIP: 'confirm',
  BACK: 'cart',
}
```

A transition whose target does not exist in `states` is refused: the machine logs
a warning and stays where it is.

## Guards

```ts
on: {
  NEXT: {
    target: 'admin-features',
    guard: (ctx) => ctx.roles?.includes('admin') ?? false,
  },
}
```

If the guard returns `false` the transition does not fire and the machine stays
put. There is no fallback target — model the alternative as a separate event.

## Context

Context is a single object, created from `flow.context` (or the context passed to
`gf.start(flow, context)`) and shared for the whole tour. Hooks receive the live
object, so mutating it is how you accumulate state:

```ts
import { createGuideFlow, type GuidanceContext } from '@guideflow/core'

interface OnboardingContext extends GuidanceContext {
  viewedCount: number
  userPlan: 'free' | 'pro'
}

const gf = createGuideFlow<OnboardingContext>()

const flow = gf.createFlow({
  id: 'onboarding',
  initial: 'intro',
  context: { viewedCount: 0, userPlan: 'free' },
  states: {
    intro: {
      steps: [{ id: 's1', content: { title: 'Welcome' }, target: '#app' }],
      onExit: (ctx) => { ctx.viewedCount++ },
      on: { NEXT: 'features' },
    },
    features: {
      steps: [{
        id: 'pro-feature',
        content: { title: 'Pro Feature' },
        target: '#pro',
        showIf: (ctx) => ctx.userPlan === 'pro',
      }],
      final: true,
    },
  },
})
```

`gf.configure({ context })` merges a patch into the running machine's context,
so later guards and `showIf` calls see it immediately.

## Lifecycle Hooks

| Hook | When it fires |
|------|--------------|
| `onEntry(ctx)` | On entering the state — including the initial state, at machine construction |
| `onExit(ctx)` | On leaving the state, before the new state is entered |

Hooks are synchronous and their return value is ignored; a promise will not be
awaited.

```ts
states: {
  setup: {
    onEntry: () => analytics.track('setup_started'),
    onExit: () => analytics.track('setup_completed'),
    steps: [/* ... */],
    on: { NEXT: 'done' },
  },
}
```

## Branching Flows

Non-linear tours come from several transitions out of one state:

```ts
states: {
  role_check: {
    steps: [{
      id: 'role',
      content: { title: 'What describes you?' },
      target: '#role-select',
    }],
    on: {
      DEVELOPER: 'dev-track',
      DESIGNER: 'design-track',
      MANAGER: 'manager-track',
    },
  },
  'dev-track': { steps: [/* ... */], final: true },
  'design-track': { steps: [/* ... */], final: true },
  'manager-track': { steps: [/* ... */], final: true },
}
```

Fire the branch from your own UI — the element the step points at is a good
place, since `clickThrough: true` keeps it interactive:

```ts
document.querySelector('#role-select')?.addEventListener('change', (e) => {
  const role = (e.target as HTMLSelectElement).value  // 'DEVELOPER' | …
  void gf.send(role)
})
```

::: warning Custom event names in step buttons
The engine forwards any unrecognised step-action string to `gf.send()`, but the
published `StepAction['action']` type only admits `'next' | 'prev' | 'skip' |
'end'`, so `{ action: 'DEVELOPER' }` does not compile. Use `gf.send()` until
that type is widened.
:::

::: warning Multi-state flows need explicit actions
The built-in renderer counts steps **per state**: `Step 1 of N` and the primary
button reflect the current state only. On the last step of a state it therefore
renders a `Done` button wired to `end`, which stops the tour rather than
following the transition. Give that step an explicit
`actions: [{ label: 'Continue', action: 'next' }]` — `next` crosses the state
boundary — or drive the transition yourself with `gf.send('NEXT')`. Keyboard
navigation (`→`) and `gf.next()` are unaffected.
:::
