// ---------------------------------------------------------------------------
// Making an A/B variant able to change a tour.
//
// `ExperimentEngine` has always assigned variants, and `Variant<T>` has always
// been generic — so `value` could always have been a whole FlowDefinition. What
// did not exist was any way to act on the result and record that the user saw
// it (AUDIT `experiment-variant-cannot-affect-any-tour`). The module docstring
// showed `createGuideFlow({ theme })`, which has never type-checked, and the
// A/B docs page was worse.
//
// Also covers `experiment-correlation`: bucketing used to be `hash % 2`, which
// made concurrent experiments perfectly correlated while every marginal split
// looked fine.
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance } from '@guideflow/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AnalyticsCollector } from '../collector.js';
import { ExperimentEngine } from '../experiments.js';
import { EXPERIMENT_EXPOSED_EVENT, startVariant } from '../start-variant.js';
import type { AnalyticsEvent, AnalyticsTransport } from '../transports/interface.js';

function makeFlow(id: string): FlowDefinition {
  return {
    id,
    initial: 'main',
    states: { main: { steps: [{ id: `${id}-s1`, content: { title: id } }], final: true } },
  };
}

function recorder(): AnalyticsTransport & { events: AnalyticsEvent[] } {
  const events: AnalyticsEvent[] = [];
  return { name: 'recorder', events, track: (e: AnalyticsEvent) => { events.push(e); } };
}

const shortFlow = makeFlow('short');
const longFlow = makeFlow('long');

const experiment = {
  id: 'onboarding-shape',
  variants: [
    { id: 'control', value: shortFlow },
    { id: 'treatment', value: longFlow },
  ] as [{ id: string; value: FlowDefinition }, { id: string; value: FlowDefinition }],
};

describe('startVariant', () => {
  let gf: GuideFlowInstance;

  beforeEach(() => {
    localStorage.clear();
    gf = createGuideFlow({ injectStyles: false });
  });

  afterEach(() => {
    gf.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('starts the assigned flow and returns the assignment', async () => {
    const engine = new ExperimentEngine('user-1');

    const result = await startVariant(gf, engine, experiment);

    expect(result).not.toBeNull();
    expect(result?.experimentId).toBe('onboarding-shape');
    expect(['control', 'treatment']).toContain(result?.variantId);
    expect(gf.isActive).toBe(true);
    expect(gf.flowId).toBe(typeof result?.value === 'string' ? result.value : result?.value.id);
  });

  it('accepts a registered flow id as the variant value', async () => {
    // Proving the map form is unnecessary: the variant value is exactly
    // gf.start()'s parameter type.
    gf.createFlow(makeFlow('registered-a'));
    gf.createFlow(makeFlow('registered-b'));
    const engine = new ExperimentEngine('user-2');

    const result = await startVariant(gf, engine, {
      id: 'by-id',
      variants: [
        { id: 'a', value: 'registered-a' },
        { id: 'b', value: 'registered-b' },
      ],
    });

    expect(result).not.toBeNull();
    expect(gf.flowId).toBe(result?.value);
  });

  it('emits an exposure event with the flow that actually ran', async () => {
    const transport = recorder();
    const collector = new AnalyticsCollector({ userId: 'user-1' }).addTransport(transport);
    const engine = new ExperimentEngine('user-1');

    const result = await startVariant(gf, engine, experiment, { collector });

    const exposure = transport.events.find((e: AnalyticsEvent) => e.event === EXPERIMENT_EXPOSED_EVENT);
    expect(exposure).toBeDefined();
    expect(exposure?.properties['experiment_id']).toBe('onboarding-shape');
    expect(exposure?.properties['variant_id']).toBe(result?.variantId);
    // Read off the instance, not the variant value — the value may be a flow id
    // string, and this way it is always what actually ran.
    expect(exposure?.properties['flow_id']).toBe(gf.flowId);
  });

  it('does not put timestamp-shaped keys in the exposure properties', async () => {
    // The vendor transports inject their own alongside the spread properties;
    // a collision silently overwrites one of them.
    const transport = recorder();
    const collector = new AnalyticsCollector({ userId: 'u' }).addTransport(transport);

    await startVariant(gf, new ExperimentEngine('u'), experiment, { collector });

    const exposure = transport.events.find((e: AnalyticsEvent) => e.event === EXPERIMENT_EXPOSED_EVENT);
    for (const key of ['timestamp', 'time', '$timestamp']) {
      expect(Object.keys(exposure?.properties ?? {})).not.toContain(key);
    }
  });

  it('lets caller properties win over the built-ins', async () => {
    const transport = recorder();
    const collector = new AnalyticsCollector({ userId: 'u' }).addTransport(transport);

    await startVariant(gf, new ExperimentEngine('u'), experiment, {
      collector,
      properties: { experiment_id: 'overridden', surface: 'billing' },
    });

    const exposure = transport.events.find((e: AnalyticsEvent) => e.event === EXPERIMENT_EXPOSED_EVENT);
    expect(exposure?.properties['experiment_id']).toBe('overridden');
    expect(exposure?.properties['surface']).toBe('billing');
  });

  it('refuses to clobber a running tour, and starts nothing', async () => {
    // TourEngine.start() ends an active tour first, which emits tour:abandon —
    // that would be recorded as the user giving up on a tour they never left.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transport = recorder();
    const collector = new AnalyticsCollector({ userId: 'u' }).addTransport(transport);
    await gf.start(makeFlow('already-running'));

    const abandoned = vi.fn();
    gf.on('tour:abandon', abandoned);

    const result = await startVariant(gf, new ExperimentEngine('u'), experiment, { collector });

    expect(result).toBeNull();
    expect(gf.flowId).toBe('already-running');
    expect(abandoned).not.toHaveBeenCalled();
    expect(transport.events.find((e: AnalyticsEvent) => e.event === EXPERIMENT_EXPOSED_EVENT)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('already running'));
  });

  it('records no exposure when start() declines', async () => {
    // start() returns without starting for a completed flow. Counting that as
    // an exposure would put users who never saw a tour in the denominator.
    const withUser = createGuideFlow({ injectStyles: false, context: { userId: 'u9' } });
    await withUser.progress.markCompleted('u9', 'short');
    await withUser.progress.markCompleted('u9', 'long');

    const transport = recorder();
    const collector = new AnalyticsCollector({ userId: 'u9' }).addTransport(transport);

    const result = await startVariant(withUser, new ExperimentEngine('u9'), experiment, {
      collector,
    });

    expect(result).toBeNull();
    expect(withUser.isActive).toBe(false);
    expect(transport.events.find((e: AnalyticsEvent) => e.event === EXPERIMENT_EXPOSED_EVENT)).toBeUndefined();
    withUser.destroy();
  });

  it('works with no collector at all', async () => {
    const result = await startVariant(gf, new ExperimentEngine('u'), experiment);
    expect(result).not.toBeNull();
    expect(gf.isActive).toBe(true);
  });

  it('is deterministic — the same user gets the same flow', async () => {
    const a = await startVariant(gf, new ExperimentEngine('stable-user'), experiment);
    gf.stop();
    const b = await startVariant(gf, new ExperimentEngine('stable-user'), experiment);

    expect(a?.variantId).toBe(b?.variantId);
    expect(a?.value).toEqual(b?.value);
  });
});

// ── The correlation defect ──────────────────────────────────────────────────

describe('experiment assignment is not correlated across experiments', () => {
  /** Which arm `user` lands in for `experimentId`. */
  function arm(user: string, experimentId: string): string {
    return new ExperimentEngine(user).assign({
      id: experimentId,
      variants: [
        { id: 'A', value: 'a' },
        { id: 'B', value: 'b' },
      ],
    }).variantId;
  }

  function agreementPct(expA: string, expB: string, n = 4000): number {
    let same = 0;
    for (let i = 0; i < n; i++) {
      const user = `user-${i}`;
      if (arm(user, expA) === arm(user, expB)) same++;
    }
    return (same / n) * 100;
  }

  it('splits each experiment roughly evenly', () => {
    let inB = 0;
    for (let i = 0; i < 4000; i++) if (arm(`user-${i}`, 'exp-one') === 'B') inB++;
    // This ALWAYS passed, including with the broken hash — which is exactly why
    // the defect survived. It is the joint distribution below that mattered.
    expect(inB / 4000).toBeGreaterThan(0.45);
    expect(inB / 4000).toBeLessThan(0.55);
  });

  it('assigns two concurrent experiments independently', () => {
    // Before the fix, bucketing was `hash % totalWeight` — for two arms, the low
    // bit of djb2. That bit is the parity of the XOR chain over the input, so
    // changing only the experiment id shifted it by a constant: these pairs
    // agreed 100.0% and 0.0% of the time respectively.
    expect(agreementPct('exp-one', 'exp-two')).toBeGreaterThan(45);
    expect(agreementPct('exp-one', 'exp-two')).toBeLessThan(55);

    expect(agreementPct('tour-theme-2024', 'cta-experiment')).toBeGreaterThan(45);
    expect(agreementPct('tour-theme-2024', 'cta-experiment')).toBeLessThan(55);
  });

  it('assigns three concurrent experiments independently', () => {
    const pairs: Array<[string, string]> = [
      ['onboarding', 'pricing'],
      ['pricing', 'checkout'],
      ['onboarding', 'checkout'],
    ];
    for (const [a, b] of pairs) {
      const pct = agreementPct(a, b);
      expect(pct, `${a} vs ${b}`).toBeGreaterThan(44);
      expect(pct, `${a} vs ${b}`).toBeLessThan(56);
    }
  });

  it('honours weights', () => {
    let inB = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const chosen = new ExperimentEngine(`user-${i}`).assign({
        id: 'weighted',
        variants: [
          { id: 'A', value: 'a', weight: 9 },
          { id: 'B', value: 'b', weight: 1 },
        ],
      }).variantId;
      if (chosen === 'B') inB++;
    }
    // ~10%. Bucketing over 10 000 rather than totalWeight is what makes a
    // 9:1 split expressible at all.
    expect(inB / n).toBeGreaterThan(0.07);
    expect(inB / n).toBeLessThan(0.13);
  });

  it('still caches per engine instance', () => {
    const engine = new ExperimentEngine('u');
    const exp = { id: 'e', variants: [{ id: 'A', value: 'a' }] as [{ id: string; value: string }] };
    expect(engine.assign(exp)).toBe(engine.assign(exp));
  });
});
