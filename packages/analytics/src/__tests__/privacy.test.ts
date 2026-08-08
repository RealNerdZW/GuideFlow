import type { GuideFlowInstance } from '@guideflow/core';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { AnalyticsCollector } from '../collector.js';
import { PrivacyPolicy } from '../privacy.js';
import type { AnalyticsEvent, AnalyticsTransport } from '../transports/interface.js';

/** Captures everything a collector emits. */
class Recorder implements AnalyticsTransport {
  readonly name = 'recorder';
  events: AnalyticsEvent[] = [];
  track(event: AnalyticsEvent): void {
    this.events.push(event);
  }
}

/**
 * Minimal GuideFlowInstance stand-in: `attach` only needs `on`, and we keep the
 * handlers so a test can fire an event without driving a real tour.
 */
function fakeInstance(): { gf: GuideFlowInstance; fire: (e: string, p: unknown) => void } {
  const handlers = new Map<string, Array<(p: unknown) => void>>();
  const gf = {
    on(event: string, handler: (p: unknown) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => handlers.set(event, (handlers.get(event) ?? []).filter((h) => h !== handler));
    },
  } as unknown as GuideFlowInstance;

  return {
    gf,
    fire: (event, payload) => (handlers.get(event) ?? []).forEach((h) => h(payload)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PrivacyPolicy — URL scrubbing', () => {
  it('strips query and fragment by default', () => {
    const p = new PrivacyPolicy();
    expect(p.scrubUrl('https://app.example/orders?email=a@b.com&token=xyz#reset')).toBe(
      'https://app.example/orders',
    );
  });

  it('keeps the full URL only when explicitly asked', () => {
    const p = new PrivacyPolicy({ urlMode: 'full' });
    expect(p.scrubUrl('https://app.example/x?token=xyz')).toBe('https://app.example/x?token=xyz');
  });

  it('reduces to origin', () => {
    const p = new PrivacyPolicy({ urlMode: 'origin' });
    expect(p.scrubUrl('https://app.example/orders/12345?x=1')).toBe('https://app.example');
  });

  it('omits the URL entirely', () => {
    const p = new PrivacyPolicy({ urlMode: 'none' });
    expect(p.scrubUrl('https://app.example/x')).toBeUndefined();
  });

  it('accepts a custom function', () => {
    const p = new PrivacyPolicy({ urlMode: (u) => u.replace(/\d+/g, ':id') });
    expect(p.scrubUrl('https://app.example/orders/12345')).toBe('https://app.example/orders/:id');
  });

  it('drops an unparseable URL rather than guessing', () => {
    expect(new PrivacyPolicy().scrubUrl('not a url')).toBeUndefined();
  });
});

describe('PrivacyPolicy — redaction', () => {
  it('drops well-known sensitive keys, case-insensitively', () => {
    const out = new PrivacyPolicy().scrubProperties({
      flow_id: 'f1',
      Email: 'a@b.com',
      API_KEY: 'sk-x',
      token: 't',
      plan: 'pro',
    });
    expect(out).toEqual({ flow_id: 'f1', plan: 'pro' });
  });

  it('recurses into nested objects', () => {
    const out = new PrivacyPolicy().scrubProperties({
      user: { id: 'u1', email: 'a@b.com' },
    });
    expect(out).toEqual({ user: { id: 'u1' } });
  });

  it('honours a replacement key list', () => {
    const out = new PrivacyPolicy({ redactKeys: ['plan'] }).scrubProperties({
      plan: 'pro',
      email: 'a@b.com',
    });
    // `plan` removed, and `email` kept — the list replaces rather than extends.
    expect(out).toEqual({ email: 'a@b.com' });
  });

  it('passes arrays and null through instead of walking them as objects', () => {
    // `typeof null === 'object'` and so is an array; recursing into either
    // turns it into `{}` / `{0: …}` and quietly changes the payload shape a
    // transport receives.
    const out = new PrivacyPolicy().scrubProperties({
      tags: ['onboarding', 'beta'],
      parent: null,
      count: 3,
    });
    expect(out).toEqual({ tags: ['onboarding', 'beta'], parent: null, count: 3 });
    expect(Array.isArray(out['tags'])).toBe(true);
  });
});

describe('PrivacyPolicy — consent and DNT', () => {
  it('collects by default', () => {
    expect(new PrivacyPolicy().allows()).toBe(true);
  });

  it('blocks until consent is granted', () => {
    const p = new PrivacyPolicy({ consent: false });
    expect(p.allows()).toBe(false);
    p.setConsent(true);
    expect(p.allows()).toBe(true);
  });

  it('re-evaluates a consent function per event', () => {
    let granted = false;
    const p = new PrivacyPolicy({ consent: () => granted });
    expect(p.allows()).toBe(false);
    granted = true;
    expect(p.allows()).toBe(true);
  });

  it('honours Do Not Track by default', () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    expect(new PrivacyPolicy().allows()).toBe(false);
  });

  it('can be told to ignore Do Not Track', () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    expect(new PrivacyPolicy({ respectDoNotTrack: false }).allows()).toBe(true);
  });

  it('blocks everything at sampleRate 0', () => {
    expect(new PrivacyPolicy({ sampleRate: 0 }).allows()).toBe(false);
  });

  it('accepts the "yes" spelling of Do Not Track', () => {
    vi.stubGlobal('navigator', { doNotTrack: 'yes' });
    expect(new PrivacyPolicy().allows()).toBe(false);
  });

  it('reads the window spelling when navigator carries none', () => {
    // Historically spelled three different ways; a stream that only checked
    // navigator.doNotTrack would silently ignore the preference in the browsers
    // that used the other two.
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { doNotTrack: '1' });
    expect(new PrivacyPolicy().allows()).toBe(false);
  });

  it('reads the legacy msDoNotTrack spelling', () => {
    vi.stubGlobal('navigator', { msDoNotTrack: '1' });
    vi.stubGlobal('window', {});
    expect(new PrivacyPolicy().allows()).toBe(false);
  });

  it('still reads navigator DNT where there is no window object', () => {
    // A worker or a non-DOM runtime has `navigator` but no `window`. Touching
    // `window.doNotTrack` unguarded there throws.
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    vi.stubGlobal('window', undefined);
    expect(new PrivacyPolicy().allows()).toBe(false);
  });

  it('treats an unset Do Not Track as no stated preference', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    expect(new PrivacyPolicy().allows()).toBe(true);
  });

  it('collects on a server, where there is no navigator to ask', () => {
    // The collector is imported by Nuxt/Next/SvelteKit users. Reading
    // `navigator` unguarded there is a ReferenceError, not a false.
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('window', undefined);
    expect(() => new PrivacyPolicy().allows()).not.toThrow();
    expect(new PrivacyPolicy().allows()).toBe(true);
  });

  it('decides sampling once, so a session is in or out for its whole life', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const p = new PrivacyPolicy({ sampleRate: 0.5 });
    // A later roll must not change the verdict, or a sampled-in session would
    // emit a partial funnel rather than a whole one.
    rnd.mockReturnValue(0.99);
    expect(p.allows()).toBe(true);
    expect(p.allows()).toBe(true);
    rnd.mockRestore();
  });

  it('samples a session out on the single roll it makes', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const p = new PrivacyPolicy({ sampleRate: 0.5 });
    rnd.mockReturnValue(0.01);
    expect(p.allows()).toBe(false);
    rnd.mockRestore();
  });
});

describe('AnalyticsCollector integration', () => {
  it('scrubs the URL on a real emitted event', () => {
    vi.stubGlobal('window', { location: { href: 'https://app.example/o?token=secret' } });
    const rec = new Recorder();
    const { gf, fire } = fakeInstance();

    new AnalyticsCollector({ userId: 'u1' }).addTransport(rec).attach(gf);
    fire('tour:start', { flowId: 'f1' });

    expect(rec.events).toHaveLength(1);
    expect(rec.events[0]?.properties['url']).toBe('https://app.example/o');
    expect(JSON.stringify(rec.events[0])).not.toContain('secret');
  });

  it('emits nothing until consent is granted', () => {
    const rec = new Recorder();
    const { gf, fire } = fakeInstance();

    const collector = new AnalyticsCollector({ privacy: { consent: false } });
    collector.addTransport(rec).attach(gf);

    fire('tour:start', { flowId: 'f1' });
    expect(rec.events).toHaveLength(0);

    collector.setConsent(true);
    fire('tour:start', { flowId: 'f1' });
    expect(rec.events).toHaveLength(1);
  });

  it('redacts sensitive globalProperties', () => {
    const rec = new Recorder();
    const { gf, fire } = fakeInstance();

    new AnalyticsCollector({ globalProperties: { plan: 'pro', email: 'a@b.com' } })
      .addTransport(rec)
      .attach(gf);
    fire('tour:start', { flowId: 'f1' });

    expect(rec.events[0]?.properties['plan']).toBe('pro');
    expect(rec.events[0]?.properties['email']).toBeUndefined();
  });
});
