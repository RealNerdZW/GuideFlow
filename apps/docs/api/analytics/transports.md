---
description: "Analytics transports reference for @guideflow/analytics — PostHog, Mixpanel, Amplitude, Segment, and Webhook transport adapters."
keywords: GuideFlow transports, PostHog, Mixpanel, Amplitude, Segment, Webhook, @guideflow/analytics
---

# Transports

Transports receive normalised `AnalyticsEvent` objects from the [`AnalyticsCollector`](./analytics-collector) and forward them to analytics platforms.

## Built-in Transports

### PostHogTransport

Sends events to [PostHog](https://posthog.com).

```ts
import { PostHogTransport } from '@guideflow/analytics'

new PostHogTransport()
```

Requires `posthog-js` to already be initialised in your app (`posthog.init(…)`). The transport calls `posthog.capture()` internally.

---

### MixpanelTransport

Sends events to [Mixpanel](https://mixpanel.com).

```ts
import { MixpanelTransport } from '@guideflow/analytics'

new MixpanelTransport()
```

Requires the Mixpanel browser SDK to be initialised (`mixpanel.init(…)`).

---

### AmplitudeTransport

Sends events to [Amplitude](https://amplitude.com).

```ts
import { AmplitudeTransport } from '@guideflow/analytics'

new AmplitudeTransport()
```

Requires `@amplitude/analytics-browser` to be initialised.

---

### SegmentTransport

Sends events to [Segment](https://segment.com) via `analytics.track()`.

```ts
import { SegmentTransport } from '@guideflow/analytics'

new SegmentTransport()
```

Requires the Segment Analytics.js snippet to be present on the page.

---

### WebhookTransport

POSTs events as JSON to any HTTP endpoint. Useful for custom backends or data warehouses.

```ts
import { WebhookTransport } from '@guideflow/analytics'

new WebhookTransport(options: WebhookTransportOptions)
```

#### WebhookTransportOptions

| Option    | Type                              | Description |
|-----------|-----------------------------------|-------------|
| `url`     | `string`                          | The endpoint URL to POST events to |
| `headers` | `Record<string, string>`          | Optional additional HTTP headers (e.g. auth tokens) |

```ts
new WebhookTransport({
  url: 'https://myapp.com/api/tours/events',
  headers: { Authorization: `Bearer ${token}` },
})
```

---

## Custom Transport

Implement `AnalyticsTransport` to integrate any platform:

```ts
import type { AnalyticsTransport, AnalyticsEvent } from '@guideflow/analytics'

class MyTransport implements AnalyticsTransport {
  async send(event: AnalyticsEvent): Promise<void> {
    await fetch('/my-endpoint', {
      method: 'POST',
      body: JSON.stringify(event),
    })
  }

  // Optional — called by collector.flush()
  async flush(): Promise<void> {
    // flush any batched events
  }
}
```

### AnalyticsEvent Shape

```ts
interface AnalyticsEvent {
  name: string                       // e.g. "guideflow.tour.started"
  userId?: string
  properties: Record<string, unknown>
  timestamp: number                  // Unix ms
}
```

## See Also

- [AnalyticsCollector](./analytics-collector)
- [ExperimentEngine](./experiment-engine)
