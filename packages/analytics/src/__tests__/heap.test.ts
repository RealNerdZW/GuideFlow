// ---------------------------------------------------------------------------
// HeapTransport.
//
// The shared vendor-transport contract — name, lazy global, silent no-op when
// the global is absent — is asserted for Heap alongside the other four in
// transports.test.ts. This file covers the two things Heap does that none of
// them do: rewrite the property bag, and shape-check the global before using it.
//
// Heap stores primitives. Hand it `{ user: { plan: 'pro' } }` and it does not
// error, does not stringify, and does not store `user` — the property is gone,
// and the only symptom is a column that never appears in Heap's UI. Flattening
// it to `user.plan` here is the difference between having that data and not.
// ---------------------------------------------------------------------------
import { runInNewContext } from 'node:vm';

import { describe, it, expect, vi, afterEach } from 'vitest';

import { HeapTransport } from '../transports/heap.js';
import type { AnalyticsEvent } from '../transports/interface.js';

type HeapMock = ReturnType<typeof makeHeap>;

const TIMESTAMP = '2026-07-30T12:00:00.000Z';

function makeHeap() {
  return vi.fn<[string, Record<string, unknown>?], void>();
}

function stubHeap(): HeapMock {
  const fn = makeHeap();
  vi.stubGlobal('heap', { track: fn });
  return fn;
}

function makeEvent(properties: Record<string, unknown>): AnalyticsEvent {
  return { event: 'guideflow.step.viewed', timestamp: TIMESTAMP, properties };
}

/** The property bag Heap was actually handed, minus the timestamp we add. */
function sentProps(fn: HeapMock): Record<string, unknown> {
  const props = { ...(fn.mock.calls[0]![1] ?? {}) };
  delete props['timestamp'];
  return props;
}

/**
 * Evaluate an expression in a fresh V8 realm, so the result is a genuine
 * foreign object rather than one wearing a `Symbol.toStringTag`. This is what
 * an iframe, a `<web-view>` or a cross-document bridge hands you: a real `Date`
 * that fails `instanceof Date` here because the constructor it was built from
 * is a different function object.
 */
function inOtherRealm(expression: string): object {
  return runInNewContext(expression) as object;
}

/** Silence and capture the one-time drop diagnostic. */
function spyOnWarn() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Resolving the global ────────────────────────────────────────────────────
//
// Heap's own install snippet opens with `window.heap = window.heap || []` and
// only swaps in the real library once heap.js has loaded. So "present but not
// callable" is not an edge case here, it is the normal state for the first
// seconds of every page load — and it is exactly when an onboarding tour fires
// its first event. Calling into it throws a TypeError, which AnalyticsCollector
// catches and reports as a console warning per event.

describe('HeapTransport global resolution', () => {
  const NOT_USABLE: Array<[string, unknown]> = [
    // The literal first line of Heap's snippet.
    ['the array stub Heap installs before heap.js loads', []],
    ['an object with no track at all', { load: () => undefined }],
    ['an object whose track is not callable', { track: 'queued' }],
    // typeof null === 'object', so this needs its own arm in getHeap.
    ['null', null],
    ['a primitive', 'loading'],
  ];

  it.each(NOT_USABLE)('treats %s as absent rather than throwing', (_label, value) => {
    vi.stubGlobal('heap', value);

    expect(() => new HeapTransport().track(makeEvent({ flow_id: 'onboarding' }))).not.toThrow();
  });

  it('drops the event silently when the global is not usable', () => {
    vi.stubGlobal('heap', []);
    const warnSpy = spyOnWarn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    new HeapTransport().track(makeEvent({ flow_id: 'onboarding' }));

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('sends once the stub is replaced by the real library', () => {
    vi.stubGlobal('heap', []);
    const transport = new HeapTransport();
    transport.track(makeEvent({ flow_id: 'early' }));

    const fn = stubHeap();
    transport.track(makeEvent({ flow_id: 'late' }));

    expect(fn).toHaveBeenCalledTimes(1);
    expect(sentProps(fn)).toEqual({ flow_id: 'late' });
  });

  it('is inert with no window at all, for SSR', () => {
    vi.stubGlobal('window', undefined);

    expect(() => new HeapTransport().track(makeEvent({ flow_id: 'x' }))).not.toThrow();
  });
});

// ── Flattening ──────────────────────────────────────────────────────────────

describe('HeapTransport property flattening', () => {
  it('passes a flat bag of primitives through unchanged', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ flow_id: 'onboarding', dwell_ms: 1200, resumed: false }));

    expect(sentProps(fn)).toEqual({ flow_id: 'onboarding', dwell_ms: 1200, resumed: false });
  });

  it('flattens a nested object into dotted keys Heap can store', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ user: { plan: 'pro', seats: 12 } }));

    expect(sentProps(fn)).toEqual({ 'user.plan': 'pro', 'user.seats': 12 });
  });

  it('flattens an array by index', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ tags: ['beta', 'eu'] }));

    expect(sentProps(fn)).toEqual({ 'tags.0': 'beta', 'tags.1': 'eu' });
  });

  it('serialises a Date, which has no enumerable keys to walk', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ signed_up: new Date(TIMESTAMP) }));

    expect(sentProps(fn)).toEqual({ signed_up: TIMESTAMP });
  });

  it('drops an invalid Date, whose toISOString would throw RangeError', () => {
    const fn = stubHeap();
    spyOnWarn();

    new HeapTransport().track(makeEvent({ signed_up: new Date('nonsense'), kept: 1 }));

    expect(sentProps(fn)).toEqual({ kept: 1 });
  });

  it('drops null and undefined instead of sending empty columns', () => {
    const fn = stubHeap();
    const warnSpy = spyOnWarn();

    new HeapTransport().track(makeEvent({ flow_id: undefined, step_id: null, kept: 'yes' }));

    expect(sentProps(fn)).toEqual({ kept: 'yes' });
    // An absent value is not a lost one, so it earns no diagnostic.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('drops values Heap has no representation for', () => {
    const fn = stubHeap();
    spyOnWarn();

    new HeapTransport().track(
      makeEvent({ cb: () => undefined, tag: Symbol('x'), big: BigInt(9), kept: 1 }),
    );

    expect(sentProps(fn)).toEqual({ kept: 1 });
  });

  it('drops NaN and Infinity, which are numbers to typeof and not to JSON', () => {
    const fn = stubHeap();
    spyOnWarn();

    new HeapTransport().track(makeEvent({ a: Number.NaN, b: Number.POSITIVE_INFINITY, kept: 0 }));

    expect(sentProps(fn)).toEqual({ kept: 0 });
  });

  it('stops at four segments rather than walking arbitrarily deep', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ a: { b: { c: { d: 'kept', e: { f: 'gone' } } } } }));

    expect(sentProps(fn)).toEqual({ 'a.b.c.d': 'kept' });
  });

  // The depth cap is also the cycle guard: globalProperties is host-supplied,
  // and a self-referencing object there would otherwise hang the page rather
  // than fail. There is no seen-set, so this is the only thing stopping it.
  it('terminates on a cyclic object', () => {
    const fn = stubHeap();
    const cyclic: Record<string, unknown> = { name: 'root' };
    cyclic['self'] = cyclic;

    expect(() => new HeapTransport().track(makeEvent({ cyclic }))).not.toThrow();
    expect(sentProps(fn)['cyclic.name']).toBe('root');
  });

  it('adds the ISO timestamp, and lets it win over a property of the same name', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ timestamp: 'from-the-host' }));

    expect(fn.mock.calls[0]![1]?.['timestamp']).toBe(TIMESTAMP);
  });
});

// ── Map and Set ─────────────────────────────────────────────────────────────
//
// Both have the exact shape of the hazard the Date special-case exists for:
// an object with no own enumerable keys, so `Object.entries` returns [] and the
// generic walk contributes nothing. `{ m: new Map([['a', 1]]) }` reached Heap
// as `{ timestamp }` and nothing else. They are serialised rather than dropped,
// because a Map in a host-supplied globalProperties is an ordinary thing to
// find and losing it is indistinguishable from never having set it.

describe('HeapTransport Map and Set', () => {
  it('serialises a Map by its keys', () => {
    const fn = stubHeap();

    new HeapTransport().track(
      makeEvent({
        limits: new Map<string, number>([
          ['seats', 12],
          ['projects', 3],
        ]),
      }),
    );

    expect(sentProps(fn)).toEqual({ 'limits.seats': 12, 'limits.projects': 3 });
  });

  it('serialises a Set by index, like an array', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ flags: new Set(['beta', 'eu']) }));

    expect(sentProps(fn)).toEqual({ 'flags.0': 'beta', 'flags.1': 'eu' });
  });

  it('recurses into a Map value', () => {
    const fn = stubHeap();

    new HeapTransport().track(makeEvent({ m: new Map([['user', { plan: 'pro' }]]) }));

    expect(sentProps(fn)).toEqual({ 'm.user.plan': 'pro' });
  });

  it('stringifies a number or boolean Map key', () => {
    const fn = stubHeap();

    new HeapTransport().track(
      makeEvent({ m: new Map<number | boolean, string>([[1, 'one'], [true, 'yes']]) }),
    );

    expect(sentProps(fn)).toEqual({ 'm.1': 'one', 'm.true': 'yes' });
  });

  // Every object key stringifies to `[object Object]`, so keeping them would
  // silently collapse distinct entries onto one column — worse than dropping.
  it('drops an entry whose key is not a primitive, and reports the loss', () => {
    const fn = stubHeap();
    const warnSpy = spyOnWarn();

    new HeapTransport().track(makeEvent({ m: new Map([[{ id: 1 }, 'a'], [{ id: 2 }, 'b']]) }));

    expect(sentProps(fn)).toEqual({});
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Realm safety ────────────────────────────────────────────────────────────
//
// `instanceof` compares against this realm's constructor. A Date built inside
// an iframe is a real Date with a real [[DateValue]] and is not `instanceof
// Date` out here — so an `instanceof` check sends it down the generic walk,
// which finds no enumerable keys and drops it. The brand read by
// Object.prototype.toString travels with the value; constructor identity does
// not.

describe('HeapTransport realm safety', () => {
  it('serialises a Date from another realm, which fails instanceof', () => {
    const fn = stubHeap();
    const foreign = inOtherRealm(`new Date(${Date.parse(TIMESTAMP)})`);
    expect(foreign instanceof Date).toBe(false);

    new HeapTransport().track(makeEvent({ signed_up: foreign }));

    expect(sentProps(fn)).toEqual({ signed_up: TIMESTAMP });
  });

  it('serialises a Map from another realm', () => {
    const fn = stubHeap();
    const foreign = inOtherRealm(`new Map([['seats', 12]])`);
    expect(foreign instanceof Map).toBe(false);

    new HeapTransport().track(makeEvent({ limits: foreign }));

    expect(sentProps(fn)).toEqual({ 'limits.seats': 12 });
  });

  it('serialises a Set from another realm', () => {
    const fn = stubHeap();
    const foreign = inOtherRealm(`new Set(['beta'])`);
    expect(foreign instanceof Set).toBe(false);

    new HeapTransport().track(makeEvent({ flags: foreign }));

    expect(sentProps(fn)).toEqual({ 'flags.0': 'beta' });
  });
});

// ── The drop diagnostic ─────────────────────────────────────────────────────

describe('HeapTransport drop diagnostic', () => {
  it('names the property that was lost', () => {
    stubHeap();
    const warnSpy = spyOnWarn();

    new HeapTransport().track(makeEvent({ pattern: /^a/, kept: 1 }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]![0])).toContain('"pattern"');
  });

  // This runs on every event. A per-event warning would bury the one signal it
  // exists to give under a wall of identical lines.
  it('warns once per transport, however many properties are lost', () => {
    stubHeap();
    const warnSpy = spyOnWarn();
    const transport = new HeapTransport();

    transport.track(makeEvent({ a: () => undefined, b: Symbol('x') }));
    transport.track(makeEvent({ c: new WeakMap() }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('says nothing when every property survives', () => {
    stubHeap();
    const warnSpy = spyOnWarn();

    new HeapTransport().track(makeEvent({ user: { plan: 'pro' }, tags: ['a'] }));

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
