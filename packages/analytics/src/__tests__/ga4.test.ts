// ---------------------------------------------------------------------------
// GA4Transport.
//
// GA4 is the only sink here that cannot take a GuideFlow event name verbatim:
// `guideflow.tour.completed` contains two characters GA4 does not allow in an
// event name, and Google's response to an illegal name is to accept the hit and
// never show the event. There is no error, no console message and no failed
// request — the data is simply not there, days later, when someone opens the
// report. So the mapping is asserted here character by character rather than
// described in a doc comment and hoped for.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, afterEach } from 'vitest';

import { GA4Transport } from '../transports/ga4.js';
import type { AnalyticsEvent } from '../transports/interface.js';

type GtagMock = ReturnType<typeof makeGtag>;

const TIMESTAMP = '2026-07-30T12:00:00.000Z';

/** GA4's own rule: a letter first, then letters/digits/underscore, ≤ 40. */
const LEGAL_GA4_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/** The six names `collector.ts` emits, verbatim. */
const COLLECTOR_EVENTS = [
  'guideflow.tour.started',
  'guideflow.tour.completed',
  'guideflow.tour.abandoned',
  'guideflow.step.viewed',
  'guideflow.step.exited',
  'guideflow.step.skipped',
];

/** Values GA4 cannot store, labelled for the table-driven drop test. */
const UNSENDABLE: Array<[string, Record<string, unknown>]> = [
  ['an object', { meta: { plan: 'pro' } }],
  ['an array', { tags: ['a', 'b'] }],
  ['null', { step_id: null }],
  ['undefined', { flow_id: undefined }],
  ['NaN', { dwell_ms: Number.NaN }],
  ['Infinity', { dwell_ms: Number.POSITIVE_INFINITY }],
  ['a function', { cb: () => undefined }],
];

function makeGtag() {
  return vi.fn<[string, string, Record<string, unknown>?], void>();
}

function stubGtag(): GtagMock {
  const fn = makeGtag();
  vi.stubGlobal('gtag', fn);
  return fn;
}

function makeEvent(
  event = 'guideflow.tour.started',
  properties: Record<string, unknown> = { flow_id: 'onboarding', step_id: 's1' },
): AnalyticsEvent {
  return { event, timestamp: TIMESTAMP, properties };
}

/** The event name GA4 was actually called with. */
function sentName(fn: GtagMock): string {
  return fn.mock.calls[0]![1];
}

/** The parameter bag GA4 was actually called with. */
function sentParams(fn: GtagMock): Record<string, unknown> {
  return fn.mock.calls[0]![2] ?? {};
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GA4Transport', () => {
  it('exposes name "ga4"', () => {
    expect(new GA4Transport().name).toBe('ga4');
  });

  it('issues a gtag "event" command', () => {
    const fn = stubGtag();

    new GA4Transport().track(makeEvent());

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toBe('event');
  });

  // ── Event names ──────────────────────────────────────────────────────────

  describe('event name mapping', () => {
    it('replaces the dots GA4 rejects with underscores', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('guideflow.tour.completed'));

      expect(sentName(fn)).toBe('guideflow_tour_completed');
    });

    it.each(COLLECTOR_EVENTS)('maps %s to a name GA4 will accept', (name) => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent(name));

      expect(sentName(fn)).toMatch(LEGAL_GA4_NAME);
    });

    it('collapses a run of illegal characters into a single underscore', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('checkout - step #2 (beta)'));

      expect(sentName(fn)).toBe('checkout_step_2_beta_');
    });

    it('prefixes gf_ when the name would not start with a letter', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('2026.launch'));

      expect(sentName(fn)).toBe('gf_2026_launch');
    });

    it('prefixes gf_ for a leading underscore, which GA4 reserves for Google', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('_internal.event'));

      expect(sentName(fn)).toBe('gf__internal_event');
    });

    it('truncates to 40 characters, after prefixing', () => {
      const fn = stubGtag();
      // 60 characters, none of them a letter to begin with.
      new GA4Transport().track(makeEvent(`9${'a'.repeat(59)}`));

      const name = sentName(fn);
      expect(name).toHaveLength(40);
      expect(name.startsWith('gf_9')).toBe(true);
      expect(name).toMatch(LEGAL_GA4_NAME);
    });
  });

  // ── Parameters ───────────────────────────────────────────────────────────

  describe('parameters', () => {
    it('forwards properties and adds the ISO timestamp', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent());

      expect(sentParams(fn)).toEqual({
        flow_id: 'onboarding',
        step_id: 's1',
        timestamp: TIMESTAMP,
      });
    });

    it('sanitises parameter names the same way as event names', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('e', { 'flow.id': 'onboarding', 'a-b': 1 }));

      expect(sentParams(fn)).toEqual({ flow_id: 'onboarding', a_b: 1, timestamp: TIMESTAMP });
    });

    it('keeps numbers and booleans as themselves', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('e', { dwell_ms: 1234, resumed: false }));

      expect(sentParams(fn)['dwell_ms']).toBe(1234);
      expect(sentParams(fn)['resumed']).toBe(false);
    });

    it('truncates a string value to 100 characters', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('e', { url: 'x'.repeat(250) }));

      expect(sentParams(fn)['url']).toHaveLength(100);
    });

    // An object, an array or a null invalidates the whole GA4 hit, not just the
    // one parameter — so the alternative to dropping them is losing the event.
    it.each(UNSENDABLE)('drops %s rather than stringifying it', (_label, properties) => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('e', properties));

      expect(sentParams(fn)).toEqual({ timestamp: TIMESTAMP });
    });

    it('lets its own timestamp win over a property of the same name', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('e', { timestamp: 'from-the-host' }));

      expect(sentParams(fn)['timestamp']).toBe(TIMESTAMP);
    });
  });

  // ── send_to ──────────────────────────────────────────────────────────────

  describe('measurementId', () => {
    it('sends no send_to when none is configured', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent());

      expect(sentParams(fn)).not.toHaveProperty('send_to');
    });

    it('forwards a configured measurementId as send_to, unsanitised', () => {
      const fn = stubGtag();

      new GA4Transport({ measurementId: 'G-ABC123XYZ' }).track(makeEvent());

      // A hyphen is illegal in a GA4 *name*; send_to is a gtag control
      // parameter, so rewriting it would point the hit at nothing.
      expect(sentParams(fn)['send_to']).toBe('G-ABC123XYZ');
    });

    it('cannot be overridden by a property called send_to', () => {
      const fn = stubGtag();

      new GA4Transport({ measurementId: 'G-REAL' }).track(makeEvent('e', { send_to: 'G-FORGED' }));

      expect(sentParams(fn)['send_to']).toBe('G-REAL');
    });

    // `send_to` is a gtag control parameter: it names the destination the hit
    // is routed to. Writing the configured value last is not what protects it,
    // because measurementId is optional and unset by default — in that, the
    // *normal*, configuration there is no later write to win, so a property of
    // that name would have redirected the event to a property nobody here
    // controls. The name is reserved whether or not one is configured.
    it('drops a send_to property when no measurementId is configured', () => {
      const fn = stubGtag();

      new GA4Transport().track(makeEvent('e', { send_to: 'G-FORGED', flow_id: 'onboarding' }));

      expect(sentParams(fn)).toEqual({ flow_id: 'onboarding', timestamp: TIMESTAMP });
    });

    // The reservation is checked on the *sanitised* name, so the name-mapping
    // rule cannot be used to launder a property into the reserved key.
    it.each(['send.to', 'send-to', 'send to'])(
      'drops %s, which sanitises to send_to',
      (key) => {
        const fn = stubGtag();

        new GA4Transport().track(makeEvent('e', { [key]: 'G-FORGED' }));

        expect(sentParams(fn)).toEqual({ timestamp: TIMESTAMP });
      },
    );
  });

  // ── The host has not loaded GA ────────────────────────────────────────────

  describe('when window.gtag is absent', () => {
    it('does not throw', () => {
      vi.stubGlobal('gtag', undefined);

      expect(() => new GA4Transport().track(makeEvent())).not.toThrow();
    });

    it('drops the event silently — no console.warn, no console.error', () => {
      vi.stubGlobal('gtag', undefined);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      new GA4Transport().track(makeEvent());

      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('returns undefined rather than a rejected promise', () => {
      vi.stubGlobal('gtag', undefined);

      expect(new GA4Transport().track(makeEvent())).toBeUndefined();
    });

    // The GA snippet defines window.dataLayer before gtag.js has loaded and a
    // hand-rolled shim sometimes leaves a non-callable placeholder behind.
    // Calling that would be a TypeError inside the collector's event loop.
    it('treats a non-callable gtag as absent', () => {
      vi.stubGlobal('gtag', { q: [] });

      expect(() => new GA4Transport().track(makeEvent())).not.toThrow();
    });

    it('is inert with no window at all, for SSR', () => {
      vi.stubGlobal('window', undefined);

      expect(() => new GA4Transport().track(makeEvent())).not.toThrow();
    });
  });

  it('reads window.gtag lazily, so GA may load after GuideFlow', () => {
    // Constructed while the global is absent — the transport must not cache it.
    const transport = new GA4Transport();
    const fn = stubGtag();

    transport.track(makeEvent());

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
