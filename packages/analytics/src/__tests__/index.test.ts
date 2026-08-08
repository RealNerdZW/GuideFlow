// ---------------------------------------------------------------------------
// The package entry point.
//
// Every other spec imports the implementation modules directly, so nothing
// asserted that `@guideflow/analytics` itself exports any of them. A re-export
// deleted in a refactor, or pointed at the wrong module, type-checks inside the
// package and breaks only at the consumer's `import` — which is the one place
// this repo cannot test. `verify-pack.mjs` checks the manifest, not the names.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';

import { AnalyticsCollector } from '../collector.js';
import { ExperimentEngine } from '../experiments.js';
import { computeFunnel } from '../funnel.js';
import * as entry from '../index.js';
import { PrivacyPolicy } from '../privacy.js';
import { EXPERIMENT_EXPOSED_EVENT, startVariant } from '../start-variant.js';
import { AmplitudeTransport } from '../transports/amplitude.js';
import { MixpanelTransport } from '../transports/mixpanel.js';
import { PostHogTransport } from '../transports/posthog.js';
import { SegmentTransport } from '../transports/segment.js';
import { WebhookTransport } from '../transports/webhook.js';

describe('package entry point', () => {
  it('re-exports each value binding, bound to the real implementation', () => {
    // Identity, not just presence: a re-export aimed at the wrong module would
    // still be `typeof 'function'`.
    expect(entry.AnalyticsCollector).toBe(AnalyticsCollector);
    expect(entry.PrivacyPolicy).toBe(PrivacyPolicy);
    expect(entry.PostHogTransport).toBe(PostHogTransport);
    expect(entry.MixpanelTransport).toBe(MixpanelTransport);
    expect(entry.AmplitudeTransport).toBe(AmplitudeTransport);
    expect(entry.SegmentTransport).toBe(SegmentTransport);
    expect(entry.WebhookTransport).toBe(WebhookTransport);
    expect(entry.computeFunnel).toBe(computeFunnel);
    expect(entry.ExperimentEngine).toBe(ExperimentEngine);
    expect(entry.startVariant).toBe(startVariant);
    expect(entry.EXPERIMENT_EXPOSED_EVENT).toBe(EXPERIMENT_EXPOSED_EVENT);
  });

  it('exports exactly the documented surface and nothing accidental', () => {
    // An export added here without a changeset is a public API change nobody
    // reviewed; one removed is a breaking change nobody noticed.
    expect(Object.keys(entry).sort()).toEqual([
      'AmplitudeTransport',
      'AnalyticsCollector',
      'EXPERIMENT_EXPOSED_EVENT',
      'ExperimentEngine',
      'MixpanelTransport',
      'PostHogTransport',
      'PrivacyPolicy',
      'SegmentTransport',
      'WebhookTransport',
      'computeFunnel',
      'startVariant',
    ]);
  });

  it('is usable through the entry alone', () => {
    // Proof the barrel yields working values, not just bound names.
    const collector = new entry.AnalyticsCollector({ userId: 'u1' });
    const seen: unknown[] = [];
    collector.addTransport({ name: 'probe', track: (e) => { seen.push(e); } });
    collector.track('custom.event', { surface: 'billing' });

    expect(seen).toHaveLength(1);
    expect(entry.computeFunnel([])).toEqual([]);
  });
});
