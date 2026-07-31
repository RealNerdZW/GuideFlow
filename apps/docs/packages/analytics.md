---
description: "@guideflow/analytics — tour event collection with privacy controls, five transports, and deterministic A/B variant assignment for GuideFlow."
keywords: "@guideflow/analytics, product tour analytics, A/B tour testing, tour event tracking"
---

# @guideflow/analytics

**Tour event collection, transports, and deterministic A/B assignment.**

[![npm version](https://img.shields.io/npm/v/@guideflow/analytics.svg)](https://www.npmjs.com/package/@guideflow/analytics)

## Installation

```bash
npm install @guideflow/core @guideflow/analytics
```

No vendor SDK is bundled. The vendor transports call a global (`window.posthog`, `window.mixpanel`,
…) that your app initialises.

## Key Exports

| Export | Kind | Description |
|--------|------|-------------|
| `AnalyticsCollector` | class | Subscribes to six tour events and fans them out to transports |
| `PrivacyPolicy` | class | The consent / DNT / scrubbing / sampling logic, usable standalone |
| `PostHogTransport` | class | `window.posthog.capture()` |
| `MixpanelTransport` | class | `window.mixpanel.track()` |
| `AmplitudeTransport` | class | `window.amplitude.track()` |
| `SegmentTransport` | class | `window.analytics.track()` |
| `WebhookTransport` | class | Batched `POST` of a JSON array |
| `ExperimentEngine` | class | Deterministic A/B variant assignment |

Exported types: `CollectorOptions`, `PrivacyOptions`, `AnalyticsEvent`, `AnalyticsTransport`,
`WebhookTransportOptions`, `Variant`, `Experiment`, `ExperimentResult`.

## What it emits

Six events, and only these six:

`guideflow.tour.started`, `guideflow.tour.completed`, `guideflow.tour.abandoned`,
`guideflow.step.viewed`, `guideflow.step.exited`, `guideflow.step.skipped`.

## Privacy defaults

Query strings and fragments are stripped from `url` and `referrer`, Do Not Track is honoured, and a
list of sensitive property names is redacted. All of it is configurable through the `privacy` option.
See [Privacy](/guide/privacy).

## A/B assignment is not applied for you

`ExperimentEngine` returns a variant. No GuideFlow API consumes it — branching on the value and
recording which variant a user saw are application code. See [A/B Testing](/guide/ab-testing).

## Links

- [npm](https://www.npmjs.com/package/@guideflow/analytics)
- [Source](https://github.com/RealNerdZW/GuideFlow/tree/master/packages/analytics)
- [Analytics Guide](/guide/analytics)
- [A/B Testing Guide](/guide/ab-testing)
- [Privacy](/guide/privacy)
