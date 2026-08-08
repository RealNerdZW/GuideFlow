---
description: "Analytics transports reference for @guideflow/analytics — PostHog, Mixpanel, Amplitude, Segment, Google Analytics 4, Heap, Webhook, and the AnalyticsTransport interface."
keywords: GuideFlow transports, PostHog, Mixpanel, Amplitude, Segment, GA4, Google Analytics, Heap, Webhook, @guideflow/analytics
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

### GA4Transport

```ts
import { GA4Transport } from '@guideflow/analytics'

new GA4Transport()
new GA4Transport({ measurementId: 'G-XXXXXXXXXX' })
```

Calls `window.gtag('event', name, params)`, read lazily on every event. A `gtag` that is present but
not callable — the placeholder a hand-rolled snippet can leave behind before `gtag.js` loads —
counts as absent.

::: warning GA4 will not tell you it dropped your event
An event name containing a character GA4 does not allow is not rejected. The hit is accepted, the
event never appears in the property, and there is no error in the console or the network tab. That
is why this transport rewrites rather than forwards.
:::

**Event and parameter names.** Every character outside `[A-Za-z0-9_]` becomes a single underscore; a
name not starting with a letter is prefixed `gf_` (GA4 requires a leading letter and reserves `_`
for Google's own events); the result is truncated to 40 characters, last.

| GuideFlow | GA4 |
|---|---|
| `guideflow.tour.started` | `guideflow_tour_started` |
| `guideflow.tour.completed` | `guideflow_tour_completed` |
| `guideflow.tour.abandoned` | `guideflow_tour_abandoned` |
| `guideflow.step.viewed` | `guideflow_step_viewed` |
| `guideflow.step.exited` | `guideflow_step_exited` |
| `guideflow.step.skipped` | `guideflow_step_skipped` |

Property keys go through the same function, so `flow.id` and `flow_id` would collapse into one
parameter — last one wins. Truncation is the other lossy step: two custom `collector.track()` names
that differ only after character 40 become one GA4 event.

**Parameter values.** Strings are cut to 100 characters. Finite numbers and booleans pass through.
Everything else — objects, arrays, `null`, `undefined`, `NaN`, `Infinity`, functions — is dropped,
because a single unsupported value invalidates the whole hit rather than the one parameter.

`timestamp` carries `event.timestamp` and wins over a property of the same name.
`measurementId` is forwarded as gtag's `send_to` and is not name-sanitised (a hyphen is illegal in a
GA4 *name*, and rewriting it would point the hit at nothing). You only need it when one page
configures more than one GA4 destination.

::: warning `send_to` is reserved
`send_to` is a gtag **control** parameter — it names the destination the hit is routed to, not
something about the event. A property called `send_to` (or `send.to`, or anything else that
sanitises to it) is therefore **dropped**, whether or not you configured a `measurementId`. If it
were not, a tour author or a `globalProperties` entry could redirect your events to a GA4 property
you do not control, and in the default configuration — no `measurementId` — there would be nothing
to overwrite the forged value with.
:::

GA4's own limits of 25 parameters per event and 50 custom dimensions per property are **not**
enforced here — silently choosing which 25 survive would be worse than letting GA4 apply its rule
where you can see it.

---

### HeapTransport

```ts
import { HeapTransport } from '@guideflow/analytics'

new HeapTransport()
```

Calls `window.heap.track(event.event, { ...flattened, timestamp: event.timestamp })`. The event name
is forwarded verbatim — Heap has no name constraints GuideFlow's names breach.

`window.heap` is resolved lazily on every event **and shape-checked**: a `heap` that is present but
has no callable `track` counts as absent. That is not a corner case — the first line of Heap's own
install snippet is `window.heap = window.heap || []`, so for the whole of page load the global is an
array with no `track` on it, which is exactly when an onboarding tour fires its first event.

Heap stores primitive property values. A nested object is not an error and not a serialised string:
the property is dropped, with no diagnostic anywhere. So this transport flattens first.

| Property | Sent to Heap |
|---|---|
| `{ user: { plan: 'pro' } }` | `user.plan: 'pro'` |
| `{ tags: ['beta', 'eu'] }` | `tags.0: 'beta'`, `tags.1: 'eu'` |
| `{ signed_up: new Date(…) }` | `signed_up: '2026-07-30T12:00:00.000Z'` |
| `{ limits: new Map([['seats', 12]]) }` | `limits.seats: 12` |
| `{ flags: new Set(['beta']) }` | `flags.0: 'beta'` |
| `{ flow_id: undefined }` | *(dropped)* |
| `{ cb: () => {} }` | *(dropped, reported)* |

`Date`, `Map` and `Set` are special-cased because all three are objects with **no own enumerable
keys** — the generic walk finds nothing in them and the property disappears. The brand check uses
`Object.prototype.toString`, not `instanceof`, so a `Date` or `Map` that arrived from an iframe or a
cross-document bridge is still recognised: `instanceof` compares constructor identity, which does
not survive a realm boundary. A `Map` entry whose **key** is not a string, number or boolean is
dropped, because every object key stringifies to `[object Object]` and keeping them would collapse
distinct entries onto one column.

Nesting stops at four segments (`a.b.c.d`). That cap is also the cycle guard: `globalProperties` is
yours, and a self-referencing object in it would otherwise walk forever rather than fail.

When a whole top-level property produces no key at all — a `RegExp`, an `Error` (whose fields are
non-enumerable), a `WeakMap`, a function, `NaN` — the transport emits **one** `console.warn` naming
it, per transport instance. `null` and `undefined` are exempt: those are absent values, not lost
ones. The warning exists because a property that is simply not there is the failure mode you cannot
debug from Heap's UI; it fires once because this runs on every event.

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
