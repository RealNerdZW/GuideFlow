import type { GuideFlowInstance } from '@guideflow/core';

import { PrivacyPolicy, type PrivacyOptions } from './privacy.js';
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
  /**
   * Consent, Do Not Track, URL scrubbing, key redaction and sampling.
   * Defaults are conservative — query strings and fragments are stripped from
   * URLs, and DNT is honoured. See PrivacyOptions.
   */
  privacy?: PrivacyOptions;
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
  /**
   * The flow currently running, so step events can name it.
   *
   * `step:enter` / `step:exit` / `step:skip` carry only a `stepId` — the engine
   * does not put the flow on them — so every step event used to ship with
   * `flow_id: undefined`. A step id is only unique *within* a flow, so a
   * downstream funnel or dashboard had to infer the flow from surrounding
   * `tour.started` events and hope the stream was in order. Tracked here for
   * the same reason `stepStartTime` is.
   */
  private currentFlowId: string | null = null;
  private privacy: PrivacyPolicy;

  constructor(opts: CollectorOptions = {}) {
    this.opts = opts;
    this.privacy = new PrivacyPolicy(opts.privacy);
  }

  /**
   * Grant or withdraw consent at runtime.
   *
   * With `privacy: { consent: false }` nothing is collected until this is
   * called with `true` — the shape a cookie banner needs.
   */
  setConsent(granted: boolean): void {
    this.privacy.setConsent(granted);
  }

  /** Register a transport implementation. Returns `this` for chaining. */
  addTransport(transport: AnalyticsTransport): this {
    this.transports.push(transport);
    return this;
  }

  /**
   * Attach the collector to a GuideFlow instance.
   * Returns an unsubscribe function.
   * Calling attach() a second time before detach() is a no-op to prevent
   * duplicate event reporting.
   */
  attach(gf: GuideFlowInstance): () => void {
    // Guard against duplicate subscriptions on repeated attach() calls
    if (this.cleanups.length > 0) {
      return () => this.detach()
    }
    this.cleanups.push(
      gf.on('tour:start', (payload) => {
        this.currentFlowId = payload.flowId;
        this.send('guideflow.tour.started', base(payload.flowId));
      }),
      gf.on('tour:complete', (payload) => {
        this.send('guideflow.tour.completed', base(payload.flowId));
        this.currentFlowId = null;
      }),
      gf.on('tour:abandon', (payload) => {
        // Reset step timer so the next tour's first step doesn't inherit stale dwell time
        this.stepStartTime = null;
        this.send('guideflow.tour.abandoned', base(payload.flowId, payload.stepId));
        this.currentFlowId = null;
      }),
      gf.on('step:enter', (payload) => {
        this.stepStartTime = Date.now();
        this.send('guideflow.step.viewed', base(this.currentFlowId ?? undefined, payload.stepId));
      }),
      gf.on('step:exit', (payload) => {
        const dwell = this.stepStartTime !== null ? Date.now() - this.stepStartTime : undefined;
        this.stepStartTime = null;
        this.send('guideflow.step.exited', {
          ...base(this.currentFlowId ?? undefined, payload.stepId),
          dwell_ms: dwell,
        });
      }),
      gf.on('step:skip', (payload) => {
        this.send('guideflow.step.skipped', base(this.currentFlowId ?? undefined, payload.stepId));
      }),
    );

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

  /**
   * Emit a custom event through the same pipeline as tour events.
   *
   * `send()` is private and is the **only** path through `PrivacyPolicy` —
   * consent, Do-Not-Track, sampling, URL scrubbing and key redaction. Without a
   * public entry point an exposure event would either bypass all of that or not
   * exist at all.
   *
   * `properties` is spread last, so it wins over `globalProperties`. Do not use
   * `timestamp`, `time` or `$timestamp` as keys: the vendor transports inject
   * their own alongside the spread properties.
   */
  track(event: string, properties: Record<string, unknown> = {}): void {
    this.send(event, properties);
  }

  private send(event: string, properties: Record<string, unknown>): void {
    // Consent, Do Not Track and sampling are checked before anything is built,
    // so a suppressed event costs nothing and reaches no transport.
    if (!this.privacy.allows()) return;

    const merged: Record<string, unknown> = {
      ...this.opts.globalProperties,
      user_id: this.opts.userId,
      ...properties,
    };

    // URLs carry more PII than any other field GuideFlow collects. Reduce them
    // before redaction so a stripped query string cannot survive in `url`.
    merged['url'] = this.privacy.scrubUrl(merged['url'] as string | undefined);
    merged['referrer'] = this.privacy.scrubUrl(merged['referrer'] as string | undefined);

    const payload: AnalyticsEvent = {
      event,
      timestamp: new Date().toISOString(),
      properties: this.privacy.scrubProperties(merged),
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
