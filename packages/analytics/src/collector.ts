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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const on = <K extends string>(event: K, handler: (payload: any) => void) => {
      const off = (gf as unknown as { on: (e: K, h: typeof handler) => () => void }).on(event, handler);
      this.cleanups.push(off);
    };

    on('tour:start', (payload: { flowId: string }) => {
      this.send('guideflow.tour.started', base(payload.flowId));
    });

    on('tour:complete', (payload: { flowId: string }) => {
      this.send('guideflow.tour.completed', base(payload.flowId));
    });

    on('tour:abandon', (payload: { flowId: string; stepId: string; stepIndex: number }) => {
      this.send('guideflow.tour.abandoned', base(payload.flowId, payload.stepId));
    });

    on('step:enter', (payload: { stepId: string; stepIndex: number; target: Element | null }) => {
      this.stepStartTime = Date.now();
      this.send('guideflow.step.viewed', base(undefined, payload.stepId));
    });

    on('step:exit', (payload: { stepId: string; stepIndex: number }) => {
      const dwell = this.stepStartTime !== null ? Date.now() - this.stepStartTime : undefined;
      this.stepStartTime = null;
      this.send('guideflow.step.exited', { ...base(undefined, payload.stepId), dwell_ms: dwell });
    });

    on('step:skip', (payload: { stepId: string }) => {
      this.send('guideflow.step.skipped', base(undefined, payload.stepId));
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
