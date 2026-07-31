---
description: "ExperimentEngine API reference — deterministic client-side A/B testing for GuideFlow tours in @guideflow/analytics."
keywords: ExperimentEngine, A/B testing, GuideFlow experiments, @guideflow/analytics
---

# ExperimentEngine

A deterministic, client-side A/B testing engine. Variant assignment is derived from a `djb2` hash of
`userId + ':' + experimentId`, so the same user always receives the same variant — no server
round-trip required.

::: tip Use `startVariant` unless you need the raw assignment
[`startVariant(gf, engine, experiment)`](../../guide/ab-testing#run-a-different-tour-per-variant)
assigns, starts the flow the variant names, and emits `guideflow.experiment.exposed` through the
collector's privacy pipeline. `assign()` is the layer underneath, for variants that change something
other than which tour runs.
:::

::: warning Assignments changed in the bucketing fix
Bucketing used to be `hash % totalWeight` — a single bit of a djb2 hash for a two-arm experiment.
Marginal splits looked fine; the joint distribution across two experiments was degenerate. See
[Multiple Experiments](../../guide/ab-testing#multiple-experiments). An experiment already in flight
will re-bucket its users, so start a fresh experiment id rather than reading across the boundary.
:::

## Constructor

```ts
import { ExperimentEngine } from '@guideflow/analytics'

new ExperimentEngine(userId: string)
```

## Methods

### `assign(experiment)`

Assigns the user to a variant and caches the result. Subsequent calls for the same `experiment.id`
return the cached assignment — **including when the variant list has changed**, so bump the
experiment id whenever you change the variants.

```ts
assign<T>(experiment: Experiment<T>): ExperimentResult<T>
```

The bucket is `djb2(userId + ':' + experimentId) % totalWeight`, walked against cumulative weights.
Weights are relative integers (default `1`), not percentages, and fractional weights do not bucket
correctly.

```ts
const engine = new ExperimentEngine('user-abc123')

const result = engine.assign({
  id: 'checkout-tour-style',
  variants: [
    { id: 'control',   value: 'minimal' },
    { id: 'treatment', value: 'bold' },
  ],
})

console.log(result.variantId)  // 'control' or 'treatment' (stable)
console.log(result.value)      // 'minimal' or 'bold'
```

---

### `peek(experiment)`

Returns the variant the user would be assigned to without writing to the cache.

```ts
peek<T>(experiment: Experiment<T>): ExperimentResult<T>
```

---

### `reset()`

Clears all cached assignments. Useful when the user logs out.

```ts
reset(): void
```

---

### `setUserId(userId)`

Updates the user ID and resets all cached assignments.

```ts
setUserId(userId: string): void
```

## Types

### `Experiment<T>`

```ts
interface Experiment<T = string> {
  id: string
  variants: [Variant<T>, ...Variant<T>[]]  // at least one required
}
```

### `Variant<T>`

```ts
interface Variant<T = string> {
  id: string
  value: T
  weight?: number  // relative weight, default 1
}
```

### `ExperimentResult<T>`

```ts
interface ExperimentResult<T = string> {
  experimentId: string
  variantId: string
  value: T
}
```

## Full Example

`value` is generic, so the cleanest use is to make the variant *be* the flow:

```ts
import { createGuideFlow } from '@guideflow/core'
import { ExperimentEngine } from '@guideflow/analytics'

const gf = createGuideFlow()
const engine = new ExperimentEngine(currentUser.id)

const { variantId, value: flow } = engine.assign({
  id: 'onboarding-shape',
  variants: [
    { id: 'control',   value: shortOnboardingFlow, weight: 2 }, // 2/3 of users
    { id: 'treatment', value: longOnboardingFlow,  weight: 1 }, // 1/3 of users
  ],
})

await gf.start(flow)

// Record the assignment yourself — there is no automatic exposure event.
collector.attach(gf) // with globalProperties: { experiment_onboarding: variantId }
```

## See Also

- [A/B Testing](../../guide/ab-testing) — applying and tracking a variant
- [AnalyticsCollector](./analytics-collector)
- [Transports](./transports)
