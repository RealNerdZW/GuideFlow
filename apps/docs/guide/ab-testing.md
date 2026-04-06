---
description: Run A/B tests on GuideFlow product tours with deterministic variant assignment. No server round-trips. Integrates with PostHog, Mixpanel, Amplitude, and more.
keywords: GuideFlow A/B testing, product tour experiments, tour variant testing, deterministic variant assignment
---

# A/B Testing

GuideFlow's `ExperimentEngine` provides deterministic variant assignment for running experiments on your tours.

## Setup

```ts
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine('user-123')
```

## Assign Variants

```ts
const { value: theme } = engine.assign({
  id: 'tour-theme-q1-2025',
  variants: [
    { id: 'control',   value: 'minimal', weight: 50 },
    { id: 'treatment', value: 'bold',    weight: 50 },
  ],
})

// Use the variant
const gf = createGuideFlow({
  // Apply different tour styles based on assignment
})
```

## Deterministic Assignment

The same `userId` always receives the same variant for a given experiment. This ensures a consistent experience:

```ts
const engine = new ExperimentEngine('user-123')

// These will always return the same result for user-123
engine.assign({ id: 'exp-1', variants: [/* ... */] })
engine.assign({ id: 'exp-1', variants: [/* ... */] }) // same result
```

## Weighted Variants

Control traffic distribution with weights:

```ts
engine.assign({
  id: 'cta-experiment',
  variants: [
    { id: 'control', value: 'default-cta', weight: 80 },   // 80% of users
    { id: 'bold',    value: 'bold-cta',    weight: 20 },    // 20% of users
  ],
})
```

## Multiple Experiments

Run multiple experiments simultaneously:

```ts
const { value: tourStyle } = engine.assign({
  id: 'tour-style',
  variants: [
    { id: 'minimal', value: 'minimal', weight: 50 },
    { id: 'detailed', value: 'detailed', weight: 50 },
  ],
})

const { value: stepCount } = engine.assign({
  id: 'tour-length',
  variants: [
    { id: 'short', value: 3, weight: 50 },
    { id: 'long', value: 7, weight: 50 },
  ],
})
```

## Tracking Results

Combine with `AnalyticsCollector` to track experiment outcomes:

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
