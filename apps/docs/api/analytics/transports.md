---
description: "Analytics transports reference for @guideflow/analytics — PostHog, Mixpanel, Amplitude, Segment, Webhook, and the AnalyticsTransport interface."
keywords: GuideFlow transports, PostHog, Mixpanel, Amplitude, Segment, Webhook, @guideflow/analytics
---

# Transports

Transports receive normalised `AnalyticsEvent` objects from the
[`AnalyticsCollector`](./analytics-collector) and forward them onward.

## The interface

```ts
interface AnalyticsTransport {
  /** Human-readable name, used in the collector's warning logs. */
  readonly name: string
  /** Called once per emitted tour event. */
  track(event: AnalyticsEvent): void | Promise<void>
  /** Optional. Called by collector.flush(). */
  flush?(): void | Promise<void>
}
```

The method the collector calls is **`track()`**. A transport that implements `send()` instead
compiles against nothing and receives nothing.

`name` is required — it is what the collector prints when your `track()` throws.

## AnalyticsEvent

```ts
interface AnalyticsEvent {
  /** e.g. 'guideflow.tour.started' */
  event: string
  /** ISO-8601, e.g. '2026-07-31T09:14:22.031Z' */
  timestamp: string
  properties: Record<string, unknown>
}
```

Three fields, exactly. The name field is `event`, not `name`. `timestamp` is an ISO string, not Unix
milliseconds. There is no top-level `userId` — it arrives as `properties.user_id`.

## Built-in Transports

### PostHogTransport

```ts
import { PostHogTransport } from '@guideflow/analytics'

new PostHogTransport()
```

Reads `window.posthog` lazily on every event and calls
`posthog.capture(event.event, { ...event.properties, $timestamp: event.timestamp })`. If the global
is absent the event is silently dropped — initialising `posthog-js` is your responsibility, but it
can happen before or after GuideFlow.

---

### MixpanelTransport

```ts
new MixpanelTransport()
```

Calls `window.mixpanel.track(event.event, { ...event.properties, time: event.timestamp })`.

---

### AmplitudeTransport

```ts
new AmplitudeTransport()
```

Calls `window.amplitude.track(event.event, { ...event.properties, time: event.timestamp })`.
Compatible with `@amplitude/analytics-browser`, which exposes `amplitude.track`.

---

### SegmentTransport

```ts
new SegmentTransport()
```

Calls `window.analytics.track(event.event, { ...event.properties, timestamp: event.timestamp })`.

---

### WebhookTransport

Queues events and POSTs them as a JSON **array** to your endpoint.

```ts
import { WebhookTransport } from '@guideflow/analytics'

new WebhookTransport(options: WebhookTransportOptions)
```

#### WebhookTransportOptions

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | **Required.** Endpoint to POST to |
| `apiKey` | `string` | `''` | Sent as `Authorization: Bearer <apiKey>` |
| `batchIntervalMs` | `number` | `0` | `0` flushes on every event. Above `0` starts an interval timer |
| `maxQueueSize` | `number` | `20` | Forces a flush when the queue reaches this length |
| `maxRetries` | `number` | `3` | Consecutive failures before the batch is dropped with a `console.warn` |

There is no `headers` option. The only header you can influence is `Authorization`, via `apiKey`.

::: warning `apiKey` is public
It travels in a request made by the browser, so anyone can read it in devtools. Treat it as a
low-privilege ingest token, never a real API key. See [Privacy](../../guide/privacy).
:::

```ts
new WebhookTransport({
  url: 'https://myapp.com/api/tours/events',
  apiKey: ingestToken,
  batchIntervalMs: 5000,
})
```

A failed flush re-queues the batch until `maxRetries` consecutive failures, after which the batch is
dropped so a dead endpoint cannot grow the queue without bound. The transport also flushes on
`beforeunload`, and exposes a `destroy()` method that clears the interval, removes that listener and
flushes once more. `destroy()` is not part of `AnalyticsTransport` — call it yourself if you tear a
collector down mid-session.

## Custom Transport

```ts
import type { AnalyticsTransport, AnalyticsEvent } from '@guideflow/analytics'

class MyTransport implements AnalyticsTransport {
  readonly name = 'my-transport'

  async track(event: AnalyticsEvent): Promise<void> {
    try {
      await fetch('/my-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      })
    } catch (err) {
      // The collector does not catch async rejections — handle them here.
      console.warn('[my-transport]', err)
    }
  }

  // Optional — called by collector.flush()
  async flush(): Promise<void> {
    // flush any batched events
  }
}
```

## See Also

- [AnalyticsCollector](./analytics-collector)
- [ExperimentEngine](./experiment-engine)
