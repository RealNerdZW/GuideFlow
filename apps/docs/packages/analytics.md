---
description: "@guideflow/analytics — Analytics, event collection and A/B testing for GuideFlow product tours. Adapters for PostHog, Mixpanel, Amplitude and custom backends."
keywords: "@guideflow/analytics, product tour analytics, A/B tour testing, tour event tracking"
---

# @guideflow/analytics

**Analytics, event collection, and A/B testing for GuideFlow.**

[![npm version](https://img.shields.io/npm/v/@guideflow/analytics.svg)](https://www.npmjs.com/package/@guideflow/analytics)

## Installation

```bash
npm install @guideflow/core @guideflow/analytics
```

## Key Exports

| Export | Description |
|--------|-------------|
| `AnalyticsCollector` | Event capture and buffering |
| `ExperimentEngine` | Deterministic A/B variant assignment |
| `PostHogTransport` | PostHog transport |
| `MixpanelTransport` | Mixpanel transport |
| `AmplitudeTransport` | Amplitude transport |
| `SegmentTransport` | Segment transport |
| `WebhookTransport` | Generic webhook transport |

## Links

- [npm](https://www.npmjs.com/package/@guideflow/analytics)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/analytics)
- [Analytics Guide](/guide/analytics)
- [A/B Testing Guide](/guide/ab-testing)
