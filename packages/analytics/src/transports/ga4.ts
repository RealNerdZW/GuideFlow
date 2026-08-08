import type { AnalyticsEvent, AnalyticsTransport } from './interface.js';

// ── GA4's limits ───────────────────────────────────────────────────────────
// Google enforces these server-side and reports nothing when a payload breaks
// them: the event simply never appears in the property. Every other transport
// here can forward `event.event` verbatim; GA4 cannot, because a dot is not a
// legal character in a GA4 event name and every GuideFlow event name has two.

/** Event and parameter names: 40 characters. */
const MAX_NAME_LENGTH = 40;
/** String parameter values: 100 characters. */
const MAX_VALUE_LENGTH = 100;

/**
 * The name mapping, stated once so it can be relied on downstream:
 *
 * - every character outside `[A-Za-z0-9_]` collapses to a single underscore,
 *   so `guideflow.tour.completed` becomes `guideflow_tour_completed` and
 *   `guideflow.step.viewed` becomes `guideflow_step_viewed`;
 * - a name that does not begin with a letter is prefixed `gf_`, because GA4
 *   requires a leading letter and reserves the `_` prefix for Google's own
 *   events;
 * - the result is truncated to 40 characters, last.
 *
 * Truncation is the one lossy step: two event names that differ only after
 * character 40 map to the same GA4 event. GuideFlow's own six are 21–24
 * characters, so this only bites custom `collector.track()` names.
 *
 * Parameter names run through the same function, so two properties that
 * sanitise to one name — `flow.id` and `flow_id` — collapse, last one wins.
 */
function toGa4Name(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]+/g, '_');
  const prefixed = /^[A-Za-z]/.test(cleaned) ? cleaned : `gf_${cleaned}`;
  return prefixed.slice(0, MAX_NAME_LENGTH);
}

/**
 * GA4 accepts strings, numbers and booleans as parameter values and nothing
 * else — an object, an array or a `null` invalidates the whole event, not just
 * the one parameter. So anything else is dropped rather than stringified:
 * a `[object Object]` in a report is worse than an absent column.
 *
 * `NaN` and `Infinity` go with them; they are numbers to `typeof` and not to
 * GA4's ingest.
 */
function toGa4Value(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value.slice(0, MAX_VALUE_LENGTH);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  return undefined;
}

/**
 * gtag **control** parameters, which are not event data and must never be
 * sourced from a property bag.
 *
 * `send_to` names the destination the hit is routed to. A property called
 * `send_to` — from a tour author, from `globalProperties`, or from anything
 * that reaches `collector.track()` — would therefore send the event to a GA4
 * property nobody here controls.
 *
 * Writing it *after* the loop is not enough to prevent that, and this file used
 * to claim it was. `measurementId` is optional and unset by default, so in the
 * default configuration there is no later write to overwrite a forged value
 * with, and the invariant the comment asserted was simply false. The name is
 * now reserved unconditionally: dropped on the way in, written only from
 * config. The check runs on the *sanitised* name, so `send.to` and `send-to`
 * cannot sneak through `toGa4Name` either.
 */
const RESERVED_PARAM_NAMES = new Set(['send_to']);

/**
 * `window.gtag` is read through a cast rather than a `declare global` block on
 * purpose, unlike this package's other vendor transports.
 *
 * A `Window.gtag` declaration would ship in our published `.d.ts` and merge
 * with whatever else declares that property in the consumer's program.
 * `@types/gtag.js` — which any app calling `gtag()` from TypeScript already has
 * — types it as a variadic `Gtag.Gtag`, and TypeScript rejects two declarations
 * of one property with different types. That is a compile error in *their*
 * build, caused by *our* types, and no test in this repo could see it.
 * `window.posthog` and friends carry the same theoretical risk with far less
 * probability; `gtag` is the one that would actually collide.
 */
type GtagFn = (command: 'event', eventName: string, params?: Record<string, unknown>) => void;

function getGtag(): GtagFn | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as unknown as { gtag?: unknown }).gtag;
  return typeof candidate === 'function' ? (candidate as GtagFn) : undefined;
}

export interface GA4TransportOptions {
  /**
   * Measurement ID (`G-XXXXXXXXXX`), forwarded as gtag's `send_to`.
   *
   * Only needed when one page configures more than one GA4 destination —
   * without it `gtag('event', …)` goes to every configured target, which is
   * usually what a single-property site wants.
   */
  measurementId?: string;
}

/**
 * Google Analytics 4 transport, over the `gtag()` command queue.
 *
 * Reads `window.gtag` lazily on every event, so it works whether the GA
 * snippet loads before or after GuideFlow — and does nothing at all if the
 * host never loads GA. Never throws.
 *
 * Names and parameters are rewritten to satisfy GA4's constraints; see
 * `toGa4Name` and `toGa4Value` above for the exact mapping. Two limits are
 * GA4's and deliberately *not* enforced here: 25 parameters per event and 50
 * custom dimensions per property. Both are account-level concerns, and
 * silently choosing which 25 parameters survive would be worse than letting
 * GA4 apply its own rule where the host can see it.
 */
export class GA4Transport implements AnalyticsTransport {
  readonly name = 'ga4';
  private readonly _measurementId: string | undefined;

  constructor(opts: GA4TransportOptions = {}) {
    this._measurementId = opts.measurementId;
  }

  track(event: AnalyticsEvent): void {
    const gtag = getGtag();
    if (!gtag) return;
    gtag('event', toGa4Name(event.event), this._toParams(event));
  }

  private _toParams(event: AnalyticsEvent): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(event.properties)) {
      const name = toGa4Name(key);
      if (RESERVED_PARAM_NAMES.has(name)) continue;
      const converted = toGa4Value(value);
      if (converted !== undefined) params[name] = converted;
    }

    // Written after the loop, so it wins over a property of the same name —
    // matching every other transport here, and collector.ts's note that
    // `timestamp` / `time` / `$timestamp` are reserved to the transports.
    params['timestamp'] = event.timestamp;

    // `send_to` is a gtag control parameter, not event data, so it is not
    // name-sanitised. Nothing in the loop above can have written this key; see
    // RESERVED_PARAM_NAMES for why that is enforced there rather than here.
    if (this._measurementId !== undefined) params['send_to'] = this._measurementId;

    return params;
  }
}
