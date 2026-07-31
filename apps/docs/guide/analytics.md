---
description: Track product tour engagement with @guideflow/analytics. Collect six tour lifecycle events and send them to PostHog, Mixpanel, Amplitude, Segment or a webhook.
keywords: GuideFlow analytics, product tour events, tour analytics PostHog Mixpanel, @guideflow/analytics
---

# Analytics

`@guideflow/analytics` subscribes to GuideFlow's tour events, normalises them, and hands them to one
or more transports. It adds no third-party SDK as a hard dependency — the vendor transports use a
global that your app has already initialised.

## Event Collection

```ts
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics'

const collector = new AnalyticsCollector({
  userId: currentUser.id,
  globalProperties: { plan: 'pro', appVersion: '2.1.0' },
})
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: '/api/analytics', batchIntervalMs: 5000 }))

const detach = collector.attach(gf)
```

`attach()` returns an unsubscribe function. Calling it twice before `detach()` is a no-op, so a
component that re-mounts will not double-report.

## Events emitted

These six, and only these six. The name comes straight from `collector.ts`.

| Event | GuideFlow event | Extra properties |
|-------|-----------------|------------------|
| `guideflow.tour.started` | `tour:start` | — |
| `guideflow.tour.completed` | `tour:complete` | — |
| `guideflow.tour.abandoned` | `tour:abandon` | `step_id` |
| `guideflow.step.viewed` | `step:enter` | `step_id` |
| `guideflow.step.exited` | `step:exit` | `step_id`, `dwell_ms` |
| `guideflow.step.skipped` | `step:skip` | `step_id` |

There is no `guideflow.tour.skipped`, no `guideflow.step.completed` and no
`guideflow.step.abandoned`. If you built a dashboard against those names it received nothing.

`flow_id` is present on the three `tour.*` events. The `step.*` events carry `step_id` but **not**
`flow_id` — the collector does not track the active flow across step events. Join on `user_id` and
time, or put the flow id in `globalProperties` yourself.

## Event shape

```ts
interface AnalyticsEvent {
  event: string       // e.g. 'guideflow.tour.started'
  timestamp: string   // ISO-8601, e.g. '2026-07-31T09:14:22.031Z'
  properties: Record<string, unknown>
}
```

The field is `event`, not `name`; `timestamp` is an ISO string, not Unix milliseconds; and there is
no top-level `userId` — it travels as `properties.user_id`.

A typical `properties` bag:

```json
{
  "plan": "pro",
  "appVersion": "2.1.0",
  "user_id": "user-123",
  "flow_id": "onboarding",
  "step_id": "welcome",
  "url": "https://app.example.com/dashboard",
  "referrer": "https://app.example.com/"
}
```

`url` and `referrer` are scrubbed before they leave — by default the query string and fragment are
stripped. See [Privacy](./privacy).

## Privacy

Collection is gated by a `privacy` option: consent, Do Not Track, URL scrubbing, key redaction and
sampling.

```ts
const collector = new AnalyticsCollector({
  userId: currentUser.id,
  privacy: {
    consent: false,        // collect nothing until setConsent(true)
    urlMode: 'path',       // default — query string and fragment dropped
    respectDoNotTrack: true,
    sampleRate: 0.25,
  },
})

collector.setConsent(true) // from your cookie banner
```

Full detail: [Privacy](./privacy).

## Transports

| Transport | Requires | Calls |
|-----------|----------|-------|
| `PostHogTransport` | `window.posthog` | `posthog.capture(event, props)` |
| `MixpanelTransport` | `window.mixpanel` | `mixpanel.track(event, props)` |
| `AmplitudeTransport` | `window.amplitude` | `amplitude.track(event, props)` |
| `SegmentTransport` | `window.analytics` | `analytics.track(event, props)` |
| `WebhookTransport` | `fetch` | `POST` of a JSON array |

The four vendor transports read their global lazily on every event, and silently do nothing if it is
absent. Initialising the vendor SDK is your job.

A transport implements `track(event)` — see [Transports](../api/analytics/transports) for the
interface and a working custom implementation.

## A/B Testing

```ts
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine(currentUser.id)

const { value: variant } = engine.assign({
  id: 'tour-theme-2024',
  variants: [
    { id: 'control',   value: 'minimal', weight: 50 },
    { id: 'treatment', value: 'bold',    weight: 50 },
  ],
})
```

Assignments are deterministic: the same `userId + experimentId` always produces the same variant, no
server required.

::: warning The variant is not consumed by GuideFlow
`ExperimentEngine` hands you a value. No GuideFlow API reads it — there is no `theme` option on
`createGuideFlow()`, and no experiment integration inside the collector. Branching on the variant,
and recording which variant a user saw, are both yours to wire. See [A/B Testing](./ab-testing).
:::
