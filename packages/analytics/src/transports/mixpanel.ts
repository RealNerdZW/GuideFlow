import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

declare global {
  interface Window {
    mixpanel?: {
      track: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

/** Mixpanel transport. Accesses `window.mixpanel` lazily. */
export class MixpanelTransport implements AnalyticsTransport {
  readonly name = 'mixpanel';

  track(event: AnalyticsEvent): void {
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.track(event.event, {
        ...event.properties,
        time: event.timestamp,
      });
    }
  }
}
