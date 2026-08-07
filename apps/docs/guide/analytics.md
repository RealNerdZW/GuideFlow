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

`flow_id` is on **all six**. It used to be missing from the three `step.*` events — the engine puts
only a `stepId` on them — which meant a step id, unique only *within* a flow, arrived unattributed
and every dashboard had to infer the flow from surrounding `tour.started` events and hope the stream
was in order. The collector tracks the running flow now.

A step event emitted with no tour open still carries `flow_id: undefined`, rather than a guess.

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

## Funnels and drop-off

The collector emits the events and leaves the arithmetic to you — a library has no business running
a dashboard. But the one number everyone actually asks for, *where do people give up*, is the same
reduction every time, so it ships:

```ts
import { computeFunnel } from '@guideflow/analytics'

const [funnel] = computeFunnel(events)

funnel.completionRate                              // 0–1
funnel.steps.filter((s) => s.dropOffRate > 0.3)    // where the tour loses people
```

```ts
interface Funnel {
  flowId: string
  started: number
  completed: number
  abandoned: number
  unfinished: number      // started, never ended — see below
  completionRate: number
  steps: FunnelStep[]     // first-seen order
}

interface FunnelStep {
  stepId: string
  reached: number
  droppedOff: number      // runs whose LAST step was this one, without completing
  dropOffRate: number     // droppedOff / reached
  skipped: number         // explicit `step:skip`, a subset of droppedOff
  medianDwellMs?: number  // absent when nothing recorded one
}
```

It is a pure function — no storage, no network, no backend. Pass it whatever event array you have:
a session buffer, a day of one browser's events, or an export from your warehouse.

Three things worth knowing:

- **`unfinished` is not `abandoned`.** A run that started and emitted no ending means the tab closed
  or the export was cut, not that the user gave up. Only the second is worth acting on. The step
  they were last on still counts as a drop-off, because that is where the funnel lost them.
- **It sorts by `timestamp` first.** A stream merged from several transports arrives in whatever
  order the merge produced, and walking that unsorted attributes steps to the wrong run.
- **It reduces the events you give it and nothing more.** Aggregating across users and sessions is
  your warehouse's job — there is no server here to do it for you. See
  [Hosting flows](./hosting-flows) for the same principle applied to delivery.

`medianDwellMs` is a median rather than a mean on purpose: one user who left a tab open over lunch
would drag a mean into uselessness.

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

`startVariant(gf, engine, experiment)` runs the flow the assigned variant names and emits
`guideflow.experiment.exposed` through this collector — so the exposure passes the same consent,
Do-Not-Track, sampling and scrubbing gate as every other event. `collector.track(name, props)` does
the same for any custom event of your own. See [A/B Testing](./ab-testing).
