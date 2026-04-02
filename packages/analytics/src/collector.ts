import type { GuideFlowInstance } from '@guideflow/core';
import type { AnalyticsTransport, AnalyticsEvent } from './transports/interface.js';

// ---------------------------------------------------------------------------
// Property builders
// ---------------------------------------------------------------------------

function base(flowId?: string, stepId?: string): Record<string, unknown> {
  return {
    flow_id: flowId,
    step_id: stepId,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    referrer: typeof document !== 'undefined' ? document.referrer : undefined,
  };
}

// ---------------------------------------------------------------------------
// AnalyticsCollector
// ---------------------------------------------------------------------------

export interface CollectorOptions {
  /** User / session identifier (injected into every event). */
  userId?: string;
  /** Additional static properties merged into every event. */
  globalProperties?: Record<string, unknown>;
}

/**
 * Subscribes to all GuideFlow tour events and forwards normalised
 * `AnalyticsEvent` objects to one or more registered transports.
 */
export class AnalyticsCollector {
  private transports: AnalyticsTransport[] = [];
  private opts: CollectorOptions;
  private cleanups: Array<() => void> = [];
  private stepStartTime: number | null = null;

  constructor(opts: CollectorOptions = {}) {
    this.opts = opts;
  }

  /** Register a transport implementation. Returns `this` for chaining. */
  addTransport(transport: AnalyticsTransport): this {
    this.transports.push(transport);
    return this;
  }

  /**
   * Attach the collector to a GuideFlow instance.
   * Returns an unsubscribe function.
   */
  attach(gf: GuideFlowInstance): () => void {
    const on = <K extends string>(event: K, handler: (...args: unknown[]) => void) => {
      const off = (gf as unknown as { on: (e: K, h: typeof handler) => () => void }).on(event, handler);
      this.cleanups.push(off);
    };

    on('tour:start', (...args) => {
      const [flowId] = args as [string];
      this.send('guideflow.tour.started', base(flowId));
    });

    on('tour:end', (...args) => {
      const [flowId] = args as [string];
      this.send('guideflow.tour.completed', base(flowId));
    });

    on('tour:skip', (...args) => {
      const [flowId, stepId] = args as [string, string];
      this.send('guideflow.tour.skipped', base(flowId, stepId));
    });

    on('step:enter', (...args) => {
      const [flowId, stepId] = args as [string, string];
      this.stepStartTime = Date.now();
      this.send('guideflow.step.viewed', base(flowId, stepId));
    });

    on('step:exit', (...args) => {
      const [flowId, stepId] = args as [string, string];
      const dwell = this.stepStartTime !== null ? Date.now() - this.stepStartTime : undefined;
      this.stepStartTime = null;
      this.send('guideflow.step.exited', { ...base(flowId, stepId), dwell_ms: dwell });
    });

    on('step:complete', (...args) => {
      const [flowId, stepId] = args as [string, string];
      this.send('guideflow.step.completed', base(flowId, stepId));
    });

    on('step:abandon', (...args) => {
      const [flowId, stepId] = args as [string, string];
      this.send('guideflow.step.abandoned', base(flowId, stepId));
    });

    return () => this.detach();
  }

  /** Detach from all GuideFlow event subscriptions. */
  detach(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }

  /** Flush all transports that support it. */
  async flush(): Promise<void> {
    await Promise.allSettled(
      this.transports.map((t) => t.flush?.()),
    );
  }

  private send(event: string, properties: Record<string, unknown>): void {
    const payload: AnalyticsEvent = {
      event,
      timestamp: new Date().toISOString(),
      properties: {
        ...this.opts.globalProperties,
        user_id: this.opts.userId,
        ...properties,
      },
    };

    this.transports.forEach((t) => {
      try {
        void t.track(payload);
      } catch (e) {
        console.warn(`[@guideflow/analytics] Transport "${t.name}" threw:`, e);
      }
    });
  }
}
