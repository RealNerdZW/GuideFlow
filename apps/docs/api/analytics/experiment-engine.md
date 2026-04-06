---
description: "ExperimentEngine API reference — deterministic client-side A/B testing for GuideFlow tours in @guideflow/analytics."
keywords: ExperimentEngine, A/B testing, GuideFlow experiments, @guideflow/analytics
---

# ExperimentEngine

A deterministic, client-side A/B testing engine. Variant assignment is derived from a `djb2` hash of `userId + experimentId`, so the same user always receives the same variant — no server round-trip required.

## Constructor

```ts
import { ExperimentEngine } from '@guideflow/analytics'

new ExperimentEngine(userId: string)
```

## Methods

### `assign(experiment)`

Assigns the user to a variant and caches the result. Subsequent calls for the same `experiment.id` return the cached assignment.

```ts
assign<T>(experiment: Experiment<T>): ExperimentResult<T>
```

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

```ts
import { createGuideFlow } from '@guideflow/core'
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine(currentUser.id)

// Assign to a theme experiment
const { value: theme } = engine.assign({
  id: 'onboarding-theme',
  variants: [
    { id: 'control',   value: 'minimal', weight: 2 },  // 2/3 of users
    { id: 'treatment', value: 'bold',    weight: 1 },  // 1/3 of users
  ],
})

const gf = createGuideFlow({ theme })
```

## See Also

- [AnalyticsCollector](./analytics-collector)
- [Transports](./transports)
