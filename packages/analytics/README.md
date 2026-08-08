# @guideflow/analytics

**Analytics, event collection, and A/B testing for GuideFlow.**

[![npm version](https://img.shields.io/npm/v/@guideflow/analytics.svg)](https://www.npmjs.com/package/@guideflow/analytics)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)

Analytics module for [GuideFlow](https://github.com/RealNerdZW/GuideFlow). Collect tour events, forward them to popular analytics platforms, and run A/B tests with deterministic variant assignment.

## Installation

```bash
npm install @guideflow/core @guideflow/analytics
```

## Quick Start

### Collect Tour Events

```ts
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics'

const collector = new AnalyticsCollector({
  userId: 'user-123',
  globalProperties: { plan: 'pro', version: '2.1' },
})

collector
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: '/api/analytics/guideflow' }))

collector.attach(gf)

// Flush buffered events (e.g. on page unload)
await collector.flush()
```

### Events Emitted

| Event | Triggered when |
|-------|---------------|
| `guideflow.tour.started` | Tour begins |
| `guideflow.tour.completed` | All steps finished |
| `guideflow.tour.abandoned` | Tour closed early |
| `guideflow.step.viewed` | Step enters viewport |
| `guideflow.step.exited` | Step dismissed (includes `dwell_ms`) |
| `guideflow.step.skipped` | Step conditionally skipped |

### A/B Testing

```ts
import { ExperimentEngine } from '@guideflow/analytics'

const engine = new ExperimentEngine('user-123')

const { value: theme } = engine.assign({
  id: 'tour-theme-q1-2025',
  variants: [
    { id: 'control',   value: 'minimal', weight: 50 },
    { id: 'treatment', value: 'bold',    weight: 50 },
  ],
})

// Assignment is deterministic — same userId always gets same variant
```

## Available Transports

| Transport | Platform |
|-----------|----------|
| `PostHogTransport` | PostHog |
| `MixpanelTransport` | Mixpanel |
| `AmplitudeTransport` | Amplitude |
| `SegmentTransport` | Segment |
| `GA4Transport` | Google Analytics 4 (`gtag`) |
| `HeapTransport` | Heap |
| `WebhookTransport` | Any HTTP endpoint |

Each vendor transport reads the SDK's own global lazily and does nothing when it is absent —
initialising the SDK stays your job. Two of them rewrite what they send, because their backends
require it: `GA4Transport` rewrites event and parameter names to GA4's `[A-Za-z0-9_]`/40-character
rule (`guideflow.tour.completed` becomes `guideflow_tour_completed`), and `HeapTransport` flattens
nested properties to dotted keys, since Heap stores primitives only and drops the rest without
saying so.

## Key Exports

| Export | Description |
|--------|-------------|
| `AnalyticsCollector` | Event capture & buffering |
| `ExperimentEngine` | Deterministic A/B variant assignment |
| `PostHogTransport` | PostHog transport |
| `MixpanelTransport` | Mixpanel transport |
| `AmplitudeTransport` | Amplitude transport |
| `SegmentTransport` | Segment transport |
| `GA4Transport` | Google Analytics 4 transport |
| `HeapTransport` | Heap transport |
| `WebhookTransport` | Generic webhook transport |

## Peer Dependencies

- `@guideflow/core` workspace:*

## Related Packages

- [`@guideflow/core`](https://www.npmjs.com/package/@guideflow/core) — Core engine (required)
- [`@guideflow/react`](https://www.npmjs.com/package/@guideflow/react) — React adapter
- [`@guideflow/ai`](https://www.npmjs.com/package/@guideflow/ai) — AI-powered tour generation

## License

[MIT](https://github.com/RealNerdZW/GuideFlow/blob/master/LICENSE)
