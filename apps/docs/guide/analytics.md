# Analytics

`@guideflow/analytics` provides event collection, transport adapters, and A/B testing without adding third-party SDKs as hard dependencies.

## Event Collection

```ts
import { AnalyticsCollector, PostHogTransport, WebhookTransport } from '@guideflow/analytics';

const collector = new AnalyticsCollector({
  userId: currentUser.id,
  globalProperties: { plan: 'pro', appVersion: '2.1.0' },
})
  .addTransport(new PostHogTransport())
  .addTransport(new WebhookTransport({ url: '/api/analytics', batchIntervalMs: 5000 }));

collector.attach(gf);
```

## Events emitted

| Event | When |
|-------|------|
| `guideflow.tour.started` | `gf.start()` called |
| `guideflow.tour.completed` | Tour finished naturally |
| `guideflow.tour.skipped` | User dismissed the tour |
| `guideflow.step.viewed` | User enters a step |
| `guideflow.step.exited` | User leaves a step (includes `dwell_ms`) |
| `guideflow.step.completed` | Step marked complete |
| `guideflow.step.abandoned` | Step dismissed mid-tour |

## Transports

| Transport | Window global |
|-----------|---------------|
| `PostHogTransport` | `window.posthog` |
| `MixpanelTransport` | `window.mixpanel` |
| `AmplitudeTransport` | `window.amplitude` |
| `SegmentTransport` | `window.analytics` |
| `WebhookTransport` | `fetch` (no global needed) |

## A/B Testing

```ts
import { ExperimentEngine } from '@guideflow/analytics';

const engine = new ExperimentEngine(currentUser.id);

const { value: theme } = engine.assign({
  id: 'tour-theme-2024',
  variants: [
    { id: 'control',   value: 'minimal', weight: 50 },
    { id: 'treatment', value: 'bold',    weight: 50 },
  ],
});

const gf = createGuideFlow({ theme });
```

Assignments are deterministic: the same `userId + experimentId` always produces the same variant — no server needed.
