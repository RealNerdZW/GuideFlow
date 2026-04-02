import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

declare global {
  interface Window {
    amplitude?: {
      track: (event: string, props?: Record<string, unknown>) => void;
    };
  }
}

/** Amplitude transport. Accesses `window.amplitude` lazily. */
export class AmplitudeTransport implements AnalyticsTransport {
  readonly name = 'amplitude';

  track(event: AnalyticsEvent): void {
    if (typeof window !== 'undefined' && window.amplitude) {
      window.amplitude.track(event.event, {
        ...event.properties,
        time: event.timestamp,
      });
    }
  }
}
