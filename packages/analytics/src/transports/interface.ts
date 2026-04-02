/** A normalized analytics event sent by the AnalyticsCollector. */
export interface AnalyticsEvent {
  /** Event name following the pattern `guideflow.<category>.<action>` */
  event: string;
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Arbitrary properties */
  properties: Record<string, unknown>;
}

/**
 * Every analytics transport must satisfy this interface.
 * Implementations may batch, queue, or send events immediately.
 */
export interface AnalyticsTransport {
  /** Human-readable name used in debug logs. */
  readonly name: string;
  /**
   * Send a single normalized event.
   * The collector calls this for every emitted tour event.
   */
  track(event: AnalyticsEvent): void | Promise<void>;
  /**
   * Optional: flush any queued events.
   * Called on page unload or when the tour is destroyed.
   */
  flush?(): void | Promise<void>;
}
