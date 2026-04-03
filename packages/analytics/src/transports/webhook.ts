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
  private _beforeUnloadHandler: (() => void) | null = null;

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
      this._beforeUnloadHandler = () => void this.flush();
      window.addEventListener('beforeunload', this._beforeUnloadHandler);
    }
  }

  track(event: AnalyticsEvent): void {
    this.queue.push(event);
    if (this.opts.batchIntervalMs === 0 || this.queue.length >= this.opts.maxQueueSize) {
      void this.flush();
    }
  }

  private _flushing = false;

  async flush(): Promise<void> {
    if (this.queue.length === 0 || this._flushing) return;
    this._flushing = true;
    const batch = this.queue.splice(0);

    const body = JSON.stringify(batch);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.apiKey) headers['Authorization'] = `Bearer ${this.opts.apiKey}`;

    try {
      await fetch(this.opts.url, { method: 'POST', headers, body });
    } catch {
      // Put events back at the front of the queue for next flush attempt
      this.queue.unshift(...batch);
    } finally {
      this._flushing = false;
    }
  }

  destroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    if (this._beforeUnloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    void this.flush();
  }
}
