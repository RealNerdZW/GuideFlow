import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

export interface WebhookTransportOptions {
  /** Full URL of the endpoint to POST events to. */
  url: string;
  /** Optional bearer token placed in the Authorization header. */
  apiKey?: string;
  /** Batch events and flush every N ms (default: immediate, i.e. 0). */
  batchIntervalMs?: number;
  /** Max events to hold in the queue before a forced flush (default: 20). */
  maxQueueSize?: number;
}

/**
 * Generic webhook transport.
 * Batches events and sends them as a JSON array via `fetch`.
 * Falls back to `navigator.sendBeacon` on page unload when the queue > 0.
 */
export class WebhookTransport implements AnalyticsTransport {
  readonly name = 'webhook';
  private opts: Required<WebhookTransportOptions>;
  private queue: AnalyticsEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: WebhookTransportOptions) {
    this.opts = {
      url: opts.url,
      apiKey: opts.apiKey ?? '',
      batchIntervalMs: opts.batchIntervalMs ?? 0,
      maxQueueSize: opts.maxQueueSize ?? 20,
    };

    if (this.opts.batchIntervalMs > 0) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.opts.batchIntervalMs);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => void this.flush());
    }
  }

  track(event: AnalyticsEvent): void {
    this.queue.push(event);
    if (this.opts.batchIntervalMs === 0 || this.queue.length >= this.opts.maxQueueSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);

    const body = JSON.stringify(batch);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.apiKey) headers['Authorization'] = `Bearer ${this.opts.apiKey}`;

    try {
      await fetch(this.opts.url, { method: 'POST', headers, body });
    } catch {
      // Silently discard — don't break the user's tour over analytics
    }
  }

  destroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    void this.flush();
  }
}
