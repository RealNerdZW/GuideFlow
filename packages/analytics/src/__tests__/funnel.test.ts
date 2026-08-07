// ---------------------------------------------------------------------------
// computeFunnel — per-step drop-off over the collector's own event stream.
//
// The collector emits everything a funnel needs and leaves the arithmetic to
// the host, which is the right split for a library with no backend. This is
// that arithmetic, and the tests below are mostly about the cases where naive
// arithmetic is wrong: a run that never ends, an abandon whose payload
// disagrees with the walk, two runs of the same flow, and a stream that arrives
// out of order.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';

import { computeFunnel } from '../funnel.js';
import type { AnalyticsEvent } from '../transports/interface.js';

let clock = 0;
const ev = (
  event: string,
  properties: Record<string, unknown> = {},
): AnalyticsEvent => ({
  event,
  timestamp: new Date(Date.UTC(2026, 0, 1) + (clock += 1000)).toISOString(),
  properties,
});

const started = (flow: string): AnalyticsEvent => ev('guideflow.tour.started', { flow_id: flow });
const completed = (flow: string): AnalyticsEvent => ev('guideflow.tour.completed', { flow_id: flow });
const abandoned = (flow: string, step: string): AnalyticsEvent =>
  ev('guideflow.tour.abandoned', { flow_id: flow, step_id: step });
const viewed = (flow: string, step: string): AnalyticsEvent =>
  ev('guideflow.step.viewed', { flow_id: flow, step_id: step });
const exited = (flow: string, step: string, dwell: number): AnalyticsEvent =>
  ev('guideflow.step.exited', { flow_id: flow, step_id: step, dwell_ms: dwell });
const skipped = (flow: string, step: string): AnalyticsEvent =>
  ev('guideflow.step.skipped', { flow_id: flow, step_id: step });

describe('computeFunnel', () => {
  it('returns nothing for an empty stream', () => {
    expect(computeFunnel([])).toEqual([]);
  });

  it('counts a completed run with no drop-off anywhere', () => {
    const [f] = computeFunnel([
      started('onboarding'),
      viewed('onboarding', 's1'),
      viewed('onboarding', 's2'),
      viewed('onboarding', 's3'),
      completed('onboarding'),
    ]);

    expect(f?.flowId).toBe('onboarding');
    expect(f?.started).toBe(1);
    expect(f?.completed).toBe(1);
    expect(f?.completionRate).toBe(1);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1', 's2', 's3']);
    expect(f?.steps.every((s) => s.droppedOff === 0)).toBe(true);
  });

  it('charges the drop-off to the step the user was actually on', () => {
    const [f] = computeFunnel([
      started('onboarding'),
      viewed('onboarding', 's1'),
      viewed('onboarding', 's2'),
      abandoned('onboarding', 's2'),
    ]);

    const byId = Object.fromEntries((f?.steps ?? []).map((s) => [s.stepId, s]));
    expect(byId['s1']?.droppedOff).toBe(0);
    expect(byId['s2']?.droppedOff).toBe(1);
    expect(byId['s2']?.dropOffRate).toBe(1);
    expect(f?.abandoned).toBe(1);
    expect(f?.completionRate).toBe(0);
  });

  it('computes a real drop-off rate across several runs', () => {
    const events = [
      // three reach s1, two reach s2, one completes
      started('f'), viewed('f', 's1'), viewed('f', 's2'), completed('f'),
      started('f'), viewed('f', 's1'), viewed('f', 's2'), abandoned('f', 's2'),
      started('f'), viewed('f', 's1'), abandoned('f', 's1'),
    ];
    const [f] = computeFunnel(events);

    const byId = Object.fromEntries((f?.steps ?? []).map((s) => [s.stepId, s]));
    expect(f?.started).toBe(3);
    expect(f?.completed).toBe(1);
    expect(f?.completionRate).toBeCloseTo(1 / 3);
    expect(byId['s1']?.reached).toBe(3);
    expect(byId['s1']?.droppedOff).toBe(1);
    expect(byId['s1']?.dropOffRate).toBeCloseTo(1 / 3);
    expect(byId['s2']?.reached).toBe(2);
    expect(byId['s2']?.droppedOff).toBe(1);
    expect(byId['s2']?.dropOffRate).toBe(0.5);
  });

  it('separates "the user gave up" from "we stopped listening"', () => {
    // A stream cut mid-run: the tab was closed, or the export ends here. That
    // is not an abandonment — nobody pressed anything — but the step is still
    // where the funnel lost them.
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'), viewed('f', 's2'),
    ]);

    expect(f?.abandoned).toBe(0);
    expect(f?.unfinished).toBe(1);
    const byId = Object.fromEntries((f?.steps ?? []).map((s) => [s.stepId, s]));
    expect(byId['s2']?.droppedOff).toBe(1);
  });

  it('treats a second `started` with no ending as the first run being cut off', () => {
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'),
      started('f'), viewed('f', 's1'), completed('f'),
    ]);

    expect(f?.started).toBe(2);
    expect(f?.completed).toBe(1);
    expect(f?.unfinished).toBe(1);
    expect(f?.steps[0]?.reached).toBe(2);
    expect(f?.steps[0]?.droppedOff).toBe(1);
  });

  it('keeps two flows apart, ordered by volume', () => {
    const events = [
      started('busy'), viewed('busy', 'a'), completed('busy'),
      started('quiet'), viewed('quiet', 'z'), completed('quiet'),
      started('busy'), viewed('busy', 'a'), completed('busy'),
    ];
    const funnels = computeFunnel(events);

    expect(funnels.map((f) => f.flowId)).toEqual(['busy', 'quiet']);
    expect(funnels[0]?.started).toBe(2);
    expect(funnels[1]?.started).toBe(1);
    // A step id is only unique within a flow — these must not be merged.
    expect(funnels[0]?.steps.map((s) => s.stepId)).toEqual(['a']);
    expect(funnels[1]?.steps.map((s) => s.stepId)).toEqual(['z']);
  });

  it('filters to one flow on request', () => {
    const events = [
      started('a'), viewed('a', 's1'), completed('a'),
      started('b'), viewed('b', 's1'), completed('b'),
    ];
    const funnels = computeFunnel(events, { flowId: 'b' });
    expect(funnels).toHaveLength(1);
    expect(funnels[0]?.flowId).toBe('b');
  });

  it('sorts an out-of-order stream before walking it', () => {
    // A stream merged from several transports, or read back out of storage,
    // arrives in whatever order the merge produced. Walking that unsorted
    // attributes steps to the wrong run.
    const inOrder = [
      started('f'), viewed('f', 's1'), viewed('f', 's2'), abandoned('f', 's2'),
    ];
    const shuffled = [inOrder[3]!, inOrder[1]!, inOrder[0]!, inOrder[2]!];

    expect(computeFunnel(shuffled)).toEqual(computeFunnel(inOrder));
  });

  it('does not mutate the array it is given', () => {
    const events = [started('f'), viewed('f', 's1'), completed('f')];
    const before = [...events];
    computeFunnel(events);
    expect(events).toEqual(before);
  });

  it('reports median dwell, not mean, so one idle tab does not move it', () => {
    const events = [
      started('f'), viewed('f', 's1'), exited('f', 's1', 1000), completed('f'),
      started('f'), viewed('f', 's1'), exited('f', 's1', 2000), completed('f'),
      started('f'), viewed('f', 's1'), exited('f', 's1', 900_000), completed('f'),
    ];
    const [f] = computeFunnel(events);
    expect(f?.steps[0]?.medianDwellMs).toBe(2000);
  });

  it('omits medianDwellMs entirely when nothing recorded one', () => {
    const [f] = computeFunnel([started('f'), viewed('f', 's1'), completed('f')]);
    expect(f?.steps[0]).not.toHaveProperty('medianDwellMs');
  });

  it('counts an explicit skip separately from a drop-off', () => {
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'), skipped('f', 's1'), abandoned('f', 's1'),
    ]);
    expect(f?.steps[0]?.skipped).toBe(1);
    expect(f?.steps[0]?.droppedOff).toBe(1);
  });

  it('attributes step events with no flow_id to the open run', () => {
    // Step events did not carry `flow_id` until this was written, so any stream
    // recorded before then has `undefined` there. The walk has to cover it or
    // every historical export produces an empty funnel.
    const legacy: AnalyticsEvent[] = [
      started('legacy'),
      ev('guideflow.step.viewed', { step_id: 's1' }),
      ev('guideflow.step.viewed', { step_id: 's2' }),
      ev('guideflow.tour.abandoned', { flow_id: 'legacy', step_id: 's2' }),
    ];
    const [f] = computeFunnel(legacy);

    expect(f?.flowId).toBe('legacy');
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1', 's2']);
    expect(f?.steps[1]?.droppedOff).toBe(1);
  });

  it('ignores step events that arrive before any tour started', () => {
    const [f] = computeFunnel([
      ev('guideflow.step.viewed', { step_id: 'orphan' }),
      started('f'), viewed('f', 's1'), completed('f'),
    ]);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1']);
  });

  it('ignores unrelated events in the same stream', () => {
    const [f] = computeFunnel([
      ev('guideflow.experiment.exposed', { flow_id: 'f' }),
      started('f'), viewed('f', 's1'), completed('f'),
      ev('some.other.product.event', { flow_id: 'f', step_id: 's9' }),
    ]);
    expect(f?.started).toBe(1);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1']);
  });

  it('never divides by zero', () => {
    const [f] = computeFunnel([completed('ghost')]);
    expect(f?.started).toBe(0);
    expect(f?.completionRate).toBe(0);
  });
});
