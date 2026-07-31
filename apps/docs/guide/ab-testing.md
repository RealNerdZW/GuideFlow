---
description: Deterministic client-side A/B variant assignment for GuideFlow tours with ExperimentEngine — and how to actually apply the variant, since nothing consumes it for you.
keywords: GuideFlow A/B testing, product tour experiments, tour variant testing, deterministic variant assignment
---

# A/B Testing

`ExperimentEngine` assigns a user to a variant deterministically, client-side, with no server
round-trip.

::: warning It assigns; it does not apply
`ExperimentEngine` is a hash function with a cache. **No GuideFlow API consumes its result.** There
is no `theme` option on `createGuideFlow()`, no experiment hook in `AnalyticsCollector`, and no
automatic exposure event. Reading the variant, branching on it, and recording it are all code you
write. Everything below shows that wiring explicitly.
:::

## Setup

```ts
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine('user-123')
```

The constructor takes the user id as its only argument. It must be stable across sessions or the
assignment is not stable.

## Assign Variants

```ts
const result = engine.assign({
  id: 'tour-length-q1-2025',
  variants: [
    { id: 'control',   value: 'short', weight: 50 },
    { id: 'treatment', value: 'long',  weight: 50 },
  ],
})

result.experimentId // 'tour-length-q1-2025'
result.variantId    // 'control' | 'treatment'
result.value        // 'short' | 'long'
```

`value` is generic — it can be a string, a number, an object, or a whole `FlowDefinition`.

## Applying a variant

### Pick a different flow

The most direct use: two flows, one experiment.

```ts
import { createGuideFlow } from '@guideflow/core'

const gf = createGuideFlow()

const { value: flow } = engine.assign({
  id: 'onboarding-shape',
  variants: [
    { id: 'control',   value: shortOnboardingFlow },
    { id: 'treatment', value: longOnboardingFlow },
  ],
})

await gf.start(flow)
```

### Change the look

GuideFlow's bundled themes are plain CSS attribute selectors — `[data-gf-theme="minimal"]`,
`"bold"`, `"glass"`, `"brutalist"`, `"enterprise"` — shipped in `@guideflow/core/styles`. Nothing in
the library sets that attribute, so you set it:

```ts
import '@guideflow/core/styles'

const { value: theme } = engine.assign({
  id: 'tour-theme-q1-2025',
  variants: [
    { id: 'control',   value: 'minimal' },
    { id: 'treatment', value: 'bold' },
  ],
})

document.documentElement.dataset['gfTheme'] = theme
```

### Change the content

```ts
const { value: copy } = engine.assign({
  id: 'welcome-copy',
  variants: [
    { id: 'control',   value: { title: 'Welcome', body: 'Let us show you around.' } },
    { id: 'treatment', value: { title: 'Ready?',  body: 'Two minutes to your first project.' } },
  ],
})

const flow = {
  id: 'onboarding',
  initial: 'main',
  states: {
    main: {
      steps: [{ id: 'welcome', target: '#app', content: copy }],
      final: true,
    },
  },
}
```

## Deterministic Assignment

Assignment is `djb2(userId + ':' + experimentId) % totalWeight`, walked against the cumulative
weights. The same user always lands in the same variant for a given experiment id — and the result is
cached in memory for the life of the engine, so repeated calls are free.

```ts
const engine = new ExperimentEngine('user-123')

engine.assign({ id: 'exp-1', variants: [/* … */] })
engine.assign({ id: 'exp-1', variants: [/* … */] }) // identical result, from cache
```

Because the assignment is cached by `experiment.id` alone, **changing the variant list without
changing the id returns the stale assignment** for the rest of the session. Bump the id when the
variants change.

Weights are relative integers, not percentages — `{ weight: 50 }` and `{ weight: 50 }` split the
same way as `{ weight: 1 }` and `{ weight: 1 }`. Fractional weights do not work: the bucket is
`hash % totalWeight` on integers.

## Weighted Variants

```ts
engine.assign({
  id: 'cta-experiment',
  variants: [
    { id: 'control', value: 'default-cta', weight: 80 }, // 80/100 of users
    { id: 'bold',    value: 'bold-cta',    weight: 20 }, // 20/100 of users
  ],
})
```

`weight` defaults to `1` when omitted.

## Multiple Experiments

Each experiment id is hashed and cached independently.

```ts
const { value: tourStyle } = engine.assign({
  id: 'tour-style',
  variants: [
    { id: 'minimal',  value: 'minimal' },
    { id: 'detailed', value: 'detailed' },
  ],
})

const { value: stepCount } = engine.assign({
  id: 'tour-length',
  variants: [
    { id: 'short', value: 3 },
    { id: 'long',  value: 7 },
  ],
})
```

## Tracking Results

There is no exposure event. To learn which variant a user saw, put the assignment into
`globalProperties` so it rides along on every tour event:

```ts
import { AnalyticsCollector, WebhookTransport } from '@guideflow/analytics'

const collector = new AnalyticsCollector({
  userId: 'user-123',
  globalProperties: {
    experiment_tour_style: tourStyle,
    experiment_tour_length: stepCount,
  },
})

collector.addTransport(new WebhookTransport({ url: '/api/analytics' }))
collector.attach(gf)
```

Your conversion metric is then `guideflow.tour.completed` grouped by those properties. See
[Analytics](./analytics) for the full list of emitted events.

`globalProperties` is spread into each event as it is sent, so assign your variants **before** the
first tour event fires — events already delivered to a transport are not revisited.

## Changing user

```ts
engine.setUserId('user-456') // resets every cached assignment
engine.reset()               // clears the cache, keeps the user id
engine.peek(experiment)      // computes an assignment without writing to the cache
```
