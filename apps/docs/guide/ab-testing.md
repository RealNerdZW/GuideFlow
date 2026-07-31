---
description: Deterministic client-side A/B variant assignment for GuideFlow tours — run a different flow per variant with startVariant, and record the exposure through your analytics pipeline.
keywords: GuideFlow A/B testing, product tour experiments, tour variant testing, deterministic variant assignment
---

# A/B Testing

`ExperimentEngine` assigns a user to a variant deterministically, client-side, with no server
round-trip. `startVariant()` runs the flow that variant names and records the exposure.

## Setup

```ts
import { AnalyticsCollector, ExperimentEngine, startVariant } from '@guideflow/analytics'

const engine = new ExperimentEngine('user-123')
```

The constructor takes the user id as its only argument. It must be stable across sessions or the
assignment is not.

## Run a different tour per variant

The most powerful thing a variant can change is **which flow runs**. `value` is generic, so it can
be a whole `FlowDefinition`:

```ts
await startVariant(gf, engine, {
  id: 'onboarding-shape',
  variants: [
    { id: 'control',   value: shortOnboardingFlow },
    { id: 'treatment', value: longOnboardingFlow },
  ],
}, { collector })
```

That assigns the variant, starts the flow, and emits `guideflow.experiment.exposed` through the
collector — which means it passes the same privacy gate as every other event: consent, Do-Not-Track,
sampling, URL scrubbing and key redaction.

The variant value can also be a **registered flow id**, which is exactly `gf.start()`'s parameter
type:

```ts
gf.createFlow(shortOnboardingFlow)
gf.createFlow(longOnboardingFlow)

await startVariant(gf, engine, {
  id: 'onboarding-shape',
  variants: [
    { id: 'control',   value: 'short-onboarding' },
    { id: 'treatment', value: 'long-onboarding' },
  ],
}, { collector })
```

### What it returns, and when it returns nothing

`startVariant` resolves to the assignment, or to `null` in two cases — starting nothing and emitting
nothing:

- **A tour is already running.** Starting a second one ends the first, which emits `tour:abandon`
  and would be recorded as the user giving up on a tour they never chose to leave.
- **`gf.start()` declined** — an unknown flow id, a dismissed flow, or one the user already
  completed. Exposure is recorded only for users who actually saw a tour; otherwise the denominator
  of the experiment is wrong.

### The exposure event

```json
{
  "event": "guideflow.experiment.exposed",
  "properties": {
    "experiment_id": "onboarding-shape",
    "variant_id": "treatment",
    "flow_id": "long-onboarding"
  }
}
```

`flow_id` is read from the instance after the tour starts, not from the variant value — so it is
always the flow that actually ran. Add your own with `properties`, which is spread last and wins:

```ts
await startVariant(gf, engine, experiment, {
  collector,
  properties: { surface: 'billing', cohort: 'q3' },
})
```

::: warning Do not use `timestamp`, `time` or `$timestamp` as property keys
The PostHog, Mixpanel, Amplitude and Segment transports each inject their own alongside your
properties, and a collision silently overwrites one of them.
:::

## Changing the theme instead of the flow

For a lighter-touch experiment, a variant can name a [theme](/themes/):

```ts
const { value: theme } = engine.assign({
  id: 'popover-style',
  variants: [
    { id: 'control', value: 'minimal' },
    { id: 'bold',    value: 'bold' },
  ],
})

const gf = createGuideFlow({ theme })
```

`theme` sets `data-gf-theme` on `<html>`, which is what the shipped stylesheets key on. It also
works through `configure({ theme })` at any time.

## Any other custom event

`collector.track()` puts anything through the same privacy pipeline:

```ts
collector.track('guideflow.experiment.converted', {
  experiment_id: 'onboarding-shape',
  variant_id: result.variantId,
})
```

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

`value` is generic — a string, a number, an object, or a whole `FlowDefinition`. Pass the experiment
straight to [`startVariant`](#run-a-different-tour-per-variant) rather than assigning and branching
by hand.

## Applying a variant by hand

`startVariant` is three lines of glue you could write yourself, and sometimes should — when the
variant changes something other than which tour runs:

```ts
const { variantId, value: stepCount } = engine.assign({
  id: 'tour-length',
  variants: [
    { id: 'short', value: 3 },
    { id: 'long',  value: 7 },
  ],
})

const flow = buildOnboardingFlow({ steps: stepCount })
await gf.start(flow)
collector.track('guideflow.experiment.exposed', {
  experiment_id: 'tour-length',
  variant_id: variantId,
})
```

Two things `startVariant` does that are easy to forget by hand: it refuses to start when a tour is
already running (which would emit `tour:abandon`), and it records the exposure **only** if the tour
actually started.

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

Each experiment id is hashed and cached independently, and — since the bucketing fix — assignments
are genuinely independent of one another.

::: tip This was broken until recently
Bucketing used to be `hash % totalWeight`, which for a two-arm experiment is a single bit of a djb2
hash. Every experiment's marginal split looked like a clean 50/50, but the *joint* distribution was
degenerate: over 10 000 users, two given experiments assigned the same arm to either 100% or 0% of
them. Running two experiments at once produced uninterpretable results, and nothing in the output
looked wrong. Assignment now uses FNV-1a with an avalanche step, bucketed over a fixed 10 000-slot
space.

Assignments **changed** as a result. An experiment already in flight will re-bucket its users; start
a fresh experiment id rather than reading across the boundary.
:::

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

`startVariant` emits `guideflow.experiment.exposed` for you. If you assign by hand, or want the
variant attached to *every* tour event rather than one exposure, put it in `globalProperties`:

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
