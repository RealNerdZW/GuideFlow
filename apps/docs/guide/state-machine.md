# State Machine

GuideFlow tours are powered by a finite state machine (FSM). Each tour is a graph of **states** connected by **transitions**. This gives you full control over branching, looping, and conditional flows.

## Core Concepts

- **State** — a named node in the graph. Each state holds an array of steps.
- **Transition** — an event that moves the machine from one state to another.
- **Guard** — a condition that must be true for a transition to fire.
- **Context** — shared data that flows through the machine and is available to guards, steps, and hooks.

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

## Transitions

Transitions are defined with the `on` property. Each key is an event name and the value is the target state:

```ts
on: {
  NEXT: 'payment',
  SKIP: 'confirm',
  BACK: 'cart',
}
```

## Guards

Guards prevent a transition from firing unless a condition is met:

```ts
on: {
  NEXT: {
    target: 'admin-features',
    guard: (ctx) => ctx.roles.includes('admin'),
  },
}
```

If the guard returns `false`, the transition is ignored.

## Context

Context is shared data available throughout the flow lifecycle:

```ts
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

## Lifecycle Hooks

Each state supports entry and exit hooks:

| Hook | When it fires |
|------|--------------|
| `onEntry(ctx)` | When the machine enters this state |
| `onExit(ctx)` | When the machine leaves this state |

```ts
states: {
  setup: {
    onEntry: (ctx) => analytics.track('setup_started'),
    onExit: (ctx) => analytics.track('setup_completed'),
    steps: [/* ... */],
    on: { NEXT: 'done' },
  },
}
```

## Branching Flows

Create non-linear tours by defining multiple transitions:

```ts
states: {
  role_check: {
    steps: [{ id: 'role', content: { title: 'What describes you?' }, target: '#role-select' }],
    on: {
      DEVELOPER: 'dev-track',
      DESIGNER: 'design-track',
      MANAGER: 'manager-track',
    },
  },
  'dev-track': { /* ... */ final: true },
  'design-track': { /* ... */ final: true },
  'manager-track': { /* ... */ final: true },
}
```
