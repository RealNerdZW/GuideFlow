import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

declare global {
  interface Window {
    analytics?: {
      track: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

/** Segment (Analytics.js) transport. Accesses `window.analytics` lazily. */
export class SegmentTransport implements AnalyticsTransport {
  readonly name = 'segment';

  track(event: AnalyticsEvent): void {
    if (typeof window !== 'undefined' && window.analytics) {
      window.analytics.track(event.event, {
        ...event.properties,
        timestamp: event.timestamp,
      });
    }
  }
}
