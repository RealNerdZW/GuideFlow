// ---------------------------------------------------------------------------
// Privacy controls for the analytics collector.
//
// Every event used to carry the full `window.location.href` and
// `document.referrer` to whichever third party a transport pointed at, with no
// consent gate, no scrubbing and no way to opt out (AUDIT `full-url-pii-leak`,
// `analytics-pii-no-consent-gate`).
//
// URLs are the most reliable PII carrier on the web: `?email=`, `?token=`,
// `/orders/12345`, `#reset=`. Sending them verbatim to a vendor is a decision
// an integrator has to make deliberately, not a default they inherit.
//
// The defaults here are therefore conservative: query string and fragment are
// stripped, and Do Not Track is honoured. Everything is overridable, because a
// first-party self-hosted sink has different needs to a third-party SaaS.
// ---------------------------------------------------------------------------

export interface PrivacyOptions {
  /**
   * Gate collection on user consent.
   *
   * - `true` (default) — collect immediately. Correct when the integrator has
   *   already obtained consent, or is on a lawful basis that does not need it.
   * - `false` — drop every event until `collector.setConsent(true)` is called.
   * - `() => boolean` — evaluated per event, for a consent manager that can
   *   change its mind mid-session.
   */
  consent?: boolean | (() => boolean);

  /**
   * Honour the browser's Do Not Track signal. Default `true`.
   *
   * DNT has no legal force in most jurisdictions and is widely ignored. It is
   * respected by default here because a user who has set it has stated a
   * preference, and product-tour telemetry is not worth overriding it for.
   */
  respectDoNotTrack?: boolean;

  /**
   * How much of the URL to record. Default `'path'`.
   *
   * - `'full'`   — href verbatim, query and fragment included. Opt in knowingly.
   * - `'path'`   — origin + pathname. Query and fragment dropped.
   * - `'origin'` — origin only.
   * - `'none'`   — omit `url` and `referrer` entirely.
   * - a function — receives the raw URL and returns whatever you want to keep.
   */
  urlMode?: 'full' | 'path' | 'origin' | 'none' | ((url: string) => string);

  /**
   * Property names to strip from every event before it reaches a transport.
   * Matched case-insensitively against the key. Nested objects are walked.
   *
   * Defaults cover the usual suspects; the list is replaced, not merged, when
   * supplied.
   */
  redactKeys?: string[];

  /**
   * Fraction of sessions to record, 0–1. Default `1` (everything).
   * The decision is made once per collector, so a sampled-out session emits
   * nothing rather than a partial funnel.
   */
  sampleRate?: number;
}

const DEFAULT_REDACT_KEYS = [
  'email', 'password', 'token', 'secret', 'apikey', 'api_key', 'authorization',
  'auth', 'ssn', 'phone', 'address', 'creditcard', 'credit_card', 'cvv',
];

/** True when the browser has asked not to be tracked. */
function doNotTrackEnabled(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Historically spelled three different ways across vendors.
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = typeof window !== 'undefined' ? (window as Window & { doNotTrack?: string }) : undefined;
  const raw = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return raw === '1' || raw === 'yes';
}

export class PrivacyPolicy {
  private opts: Required<Omit<PrivacyOptions, 'urlMode'>> & Pick<PrivacyOptions, 'urlMode'>;
  private redact: Set<string>;
  /** Sampling is decided once, so a session is either in or out for its whole life. */
  private sampledIn: boolean;
  private consentOverride: boolean | null = null;

  constructor(opts: PrivacyOptions = {}) {
    this.opts = {
      consent: opts.consent ?? true,
      respectDoNotTrack: opts.respectDoNotTrack ?? true,
      redactKeys: opts.redactKeys ?? DEFAULT_REDACT_KEYS,
      sampleRate: opts.sampleRate ?? 1,
      ...(opts.urlMode !== undefined && { urlMode: opts.urlMode }),
    };
    this.redact = new Set(this.opts.redactKeys.map((k) => k.toLowerCase()));
    this.sampledIn = this.opts.sampleRate >= 1 || Math.random() < this.opts.sampleRate;
  }

  /** Grant or withdraw consent at runtime. Overrides the constructor option. */
  setConsent(granted: boolean): void {
    this.consentOverride = granted;
  }

  /** Whether an event may be collected at all. */
  allows(): boolean {
    if (!this.sampledIn) return false;
    if (this.opts.respectDoNotTrack && doNotTrackEnabled()) return false;

    if (this.consentOverride !== null) return this.consentOverride;
    const { consent } = this.opts;
    return typeof consent === 'function' ? consent() : consent;
  }

  /** Reduce a URL according to `urlMode`. Returns undefined when omitted. */
  scrubUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    const mode = this.opts.urlMode ?? 'path';

    if (typeof mode === 'function') return mode(url);
    if (mode === 'none') return undefined;
    if (mode === 'full') return url;

    try {
      const parsed = new URL(url);
      return mode === 'origin' ? parsed.origin : parsed.origin + parsed.pathname;
    } catch {
      // Not a parseable absolute URL — drop it rather than guess.
      return undefined;
    }
  }

  /**
   * Remove redacted keys from a property bag, recursing into nested objects.
   * Values are dropped, not masked: a masked value still tells a vendor the
   * field was present.
   */
  scrubProperties(props: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (this.redact.has(key.toLowerCase())) continue;
      out[key] =
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? this.scrubProperties(value as Record<string, unknown>)
          : value;
    }
    return out;
  }
}
