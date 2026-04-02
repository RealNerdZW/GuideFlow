import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

/**
 * PostHog transport. Lazy-accesses `window.posthog` so it works regardless
 * of whether PostHog is loaded before or after GuideFlow.
 */
export class PostHogTransport implements AnalyticsTransport {
  readonly name = 'posthog';

  track(event: AnalyticsEvent): void {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.capture(event.event, {
        ...event.properties,
        $timestamp: event.timestamp,
      });
    }
  }
}
