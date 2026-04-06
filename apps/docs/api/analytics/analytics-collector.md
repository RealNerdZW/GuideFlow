---
description: "AnalyticsCollector API reference — subscribe to GuideFlow tour events and forward them to analytics transports in @guideflow/analytics."
keywords: AnalyticsCollector, GuideFlow analytics, tour events, @guideflow/analytics
---

# AnalyticsCollector

Subscribes to all GuideFlow tour lifecycle events and forwards normalised `AnalyticsEvent` objects to one or more registered [transports](./transports).

## Constructor

```ts
import { AnalyticsCollector } from '@guideflow/analytics'

new AnalyticsCollector(opts?: CollectorOptions)
```

### CollectorOptions

| Option               | Type                            | Description |
|----------------------|---------------------------------|-------------|
| `userId`             | `string`                        | User / session identifier injected into every event |
| `globalProperties`   | `Record<string, unknown>`       | Static properties merged into every event payload |

## Methods

### `addTransport(transport)`

Register a transport to receive events. Returns `this` for chaining.

```ts
addTransport(transport: AnalyticsTransport): this
```

```ts
const collector = new AnalyticsCollector({ userId: 'user-123' })
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: '/api/analytics' }))
```

---

### `attach(instance)`

Attach the collector to a GuideFlow instance. Begins listening to tour events immediately. Returns an unsubscribe function.

Calling `attach()` a second time before `detach()` is a no-op to prevent duplicate reporting.

```ts
attach(gf: GuideFlowInstance): () => void
```

```ts
const detach = collector.attach(gf)

// Later, to stop tracking:
detach()
```

---

### `detach()`

Unsubscribes from all GuideFlow events.

```ts
detach(): void
```

---

### `flush()`

Calls `flush()` on all registered transports that support it (e.g. for batched transports). Returns a promise that resolves when all transports have flushed.

```ts
async flush(): Promise<void>
```

## Tracked Events

| Event name                    | Fired when |
|-------------------------------|------------|
| `guideflow.tour.started`      | A tour begins |
| `guideflow.tour.completed`    | A tour reaches the final step |
| `guideflow.tour.abandoned`    | A tour is dismissed mid-flow |
| `guideflow.step.viewed`       | The user enters a step |
| `guideflow.step.exited`       | The user exits a step (includes `dwell_ms`) |
| `guideflow.step.skipped`      | A step is skipped |

## Full Example

```ts
import { createGuideFlow } from '@guideflow/core'
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics'

const gf = createGuideFlow({ theme: 'bold' })

const collector = new AnalyticsCollector({
  userId: currentUser.id,
  globalProperties: { app_version: '2.0.0' },
})
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: 'https://myapp.com/api/tours/events' }))

collector.attach(gf)
```

## See Also

- [Transports](./transports) — PostHog, Mixpanel, Amplitude, Segment, Webhook
- [ExperimentEngine](./experiment-engine) — A/B testing
