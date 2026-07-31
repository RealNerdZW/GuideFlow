---
description: "AnalyticsCollector API reference — subscribe to GuideFlow tour events and forward them to analytics transports in @guideflow/analytics."
keywords: AnalyticsCollector, GuideFlow analytics, tour events, @guideflow/analytics
---

# AnalyticsCollector

Subscribes to six GuideFlow tour events and forwards normalised `AnalyticsEvent` objects to the
registered [transports](./transports).

## Constructor

```ts
import { AnalyticsCollector } from '@guideflow/analytics'

new AnalyticsCollector(opts?: CollectorOptions)
```

### CollectorOptions

| Option | Type | Description |
|---|---|---|
| `userId` | `string` | Injected into every event as `properties.user_id` |
| `globalProperties` | `Record<string, unknown>` | Spread into every event's `properties` |
| `privacy` | `PrivacyOptions` | Consent gate, Do Not Track, URL scrubbing, key redaction, sampling |

### PrivacyOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `consent` | `boolean \| (() => boolean)` | `true` | `false` drops everything until `setConsent(true)`. A function is evaluated per event |
| `respectDoNotTrack` | `boolean` | `true` | Collect nothing when the browser sets DNT |
| `urlMode` | `'full' \| 'path' \| 'origin' \| 'none' \| ((url: string) => string)` | `'path'` | How much of `url`/`referrer` to record. `'path'` drops query string and fragment |
| `redactKeys` | `string[]` | see below | Property names stripped case-insensitively, including inside nested objects. **Replaces** the default list |
| `sampleRate` | `number` | `1` | 0–1. Decided once per collector, so a sampled-out session emits nothing rather than a partial funnel |

Default `redactKeys`: `email`, `password`, `token`, `secret`, `apikey`, `api_key`, `authorization`,
`auth`, `ssn`, `phone`, `address`, `creditcard`, `credit_card`, `cvv`.

See [Privacy](../../guide/privacy) for the reasoning.

## Methods

### `addTransport(transport)`

Register a transport. Returns `this` for chaining.

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

Subscribe to the instance's tour events. Returns a detach function.

```ts
attach(gf: GuideFlowInstance): () => void
```

Calling `attach()` a second time before `detach()` subscribes nothing — it returns a detach function
for the existing subscriptions, so a component that re-mounts will not double-report.

```ts
const detach = collector.attach(gf)
detach()
```

---

### `detach()`

Unsubscribe from every GuideFlow event.

```ts
detach(): void
```

---

### `setConsent(granted)`

Grant or withdraw consent at runtime. Overrides the `privacy.consent` constructor option in both
directions.

```ts
setConsent(granted: boolean): void
```

```ts
const collector = new AnalyticsCollector({ privacy: { consent: false } })
// …cookie banner accepted…
collector.setConsent(true)
```

---

### `flush()`

Calls `flush()` on every transport that implements it, via `Promise.allSettled` — one transport
rejecting does not prevent the others from flushing.

```ts
flush(): Promise<void>
```

## Tracked Events

| Event name | GuideFlow event | Properties beyond the base set |
|---|---|---|
| `guideflow.tour.started` | `tour:start` | `flow_id` |
| `guideflow.tour.completed` | `tour:complete` | `flow_id` |
| `guideflow.tour.abandoned` | `tour:abandon` | `flow_id`, `step_id` |
| `guideflow.step.viewed` | `step:enter` | `step_id` |
| `guideflow.step.exited` | `step:exit` | `step_id`, `dwell_ms` |
| `guideflow.step.skipped` | `step:skip` | `step_id` |

That is the complete list. The collector does not emit `guideflow.tour.skipped`,
`guideflow.step.completed` or `guideflow.step.abandoned`.

The base property set on every event is `user_id`, `flow_id`, `step_id`, `url`, `referrer`, plus your
`globalProperties`. `flow_id` is `undefined` on the three `step.*` events — the collector does not
carry the active flow id across step events.

`dwell_ms` is the milliseconds between `step:enter` and `step:exit`. It is `undefined` if no
`step:enter` was seen first, and it is reset on `tour:abandon` so the next tour's first step does not
inherit stale dwell time.

## Full Example

```ts
import { createGuideFlow } from '@guideflow/core'
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics'

const gf = createGuideFlow()

const collector = new AnalyticsCollector({
  userId: currentUser.id,
  globalProperties: { app_version: '2.0.0' },
  privacy: { consent: false, sampleRate: 0.5 },
})
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: 'https://myapp.com/api/tours/events' }))

collector.attach(gf)
collector.setConsent(await userAcceptedAnalytics())
```

A transport whose `track()` throws **synchronously** is caught and reported with `console.warn`, and
the remaining transports still receive the event. An `async track()` that rejects is not caught by
the collector — handle your own errors inside the transport.

## See Also

- [Transports](./transports) — PostHog, Mixpanel, Amplitude, Segment, Webhook, custom
- [ExperimentEngine](./experiment-engine) — A/B assignment
- [Privacy](../../guide/privacy)
