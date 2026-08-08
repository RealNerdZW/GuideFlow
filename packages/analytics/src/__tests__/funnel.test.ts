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

  it('averages the two middle samples when the dwell count is even', () => {
    // Three samples pick a middle one; four have to average the inner pair, and
    // getting that wrong shows up as a median that is also a recorded value.
    const events = [
      started('f'), viewed('f', 's1'), exited('f', 's1', 1000), completed('f'),
      started('f'), viewed('f', 's1'), exited('f', 's1', 2000), completed('f'),
      started('f'), viewed('f', 's1'), exited('f', 's1', 3000), completed('f'),
      started('f'), viewed('f', 's1'), exited('f', 's1', 900_000), completed('f'),
    ];
    const [f] = computeFunnel(events);
    expect(f?.steps[0]?.medianDwellMs).toBe(2500);
  });

  it('keeps the given order for events sharing a millisecond', () => {
    // The collector emits synchronously in engine order, so a whole run can land
    // on one timestamp. The sort must be a no-op there — a comparator that did
    // not return 0 for a tie would let an engine reorder the run and charge the
    // drop-off to the wrong step.
    const stamp = new Date(Date.UTC(2026, 1, 1)).toISOString();
    const sameMs = (e: AnalyticsEvent): AnalyticsEvent => ({ ...e, timestamp: stamp });

    const [f] = computeFunnel([
      sameMs(started('f')),
      sameMs(viewed('f', 's1')),
      sameMs(viewed('f', 's2')),
      sameMs(abandoned('f', 's2')),
    ]);

    expect(f?.started).toBe(1);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1', 's2']);
    expect(f?.steps[1]?.droppedOff).toBe(1);
    expect(f?.steps[0]?.droppedOff).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Incomplete payloads.
//
// `flow_id` on step events is new, `step_id` on an abandon can be absent, and a
// merged export can be missing whichever field the producer never wrote. Every
// case below is a stream a host can really hand this function, and the
// difference between the fallbacks working and not is an empty funnel.
// ---------------------------------------------------------------------------

describe('computeFunnel — attribution when a payload is incomplete', () => {
  it('ignores a started event with no flow_id and leaves the open run alone', () => {
    // There is no honest flow to charge it to, and treating it as a run
    // boundary would close the run that is genuinely open and bank a phantom
    // `unfinished`.
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'),
      ev('guideflow.tour.started', {}),
      viewed('f', 's2'), completed('f'),
    ]);

    expect(f?.started).toBe(1);
    expect(f?.unfinished).toBe(0);
    expect(f?.completed).toBe(1);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1', 's2']);
  });

  it('invents no flow for a started event that names none', () => {
    const funnels = computeFunnel([
      ev('guideflow.tour.started', {}),
      ev('guideflow.step.viewed', { step_id: 's1' }),
    ]);
    expect(funnels).toEqual([]);
  });

  it('attributes a completed event with no flow_id to the open run', () => {
    const [f] = computeFunnel([
      started('legacy'),
      ev('guideflow.step.viewed', { step_id: 's1' }),
      ev('guideflow.tour.completed', {}),
    ]);

    expect(f?.flowId).toBe('legacy');
    expect(f?.completed).toBe(1);
    expect(f?.unfinished).toBe(0);
    expect(f?.steps[0]?.droppedOff).toBe(0);
  });

  it('drops a completed event that names no flow and follows no run', () => {
    expect(computeFunnel([ev('guideflow.tour.completed', {})])).toEqual([]);
  });

  it('attributes an abandon with no flow_id to the open run', () => {
    const [f] = computeFunnel([
      started('legacy'),
      ev('guideflow.step.viewed', { step_id: 's1' }),
      ev('guideflow.tour.abandoned', { step_id: 's1' }),
    ]);

    expect(f?.flowId).toBe('legacy');
    expect(f?.abandoned).toBe(1);
    // An abandon is an ending, so the run must not also be counted unfinished.
    expect(f?.unfinished).toBe(0);
    expect(f?.steps[0]?.droppedOff).toBe(1);
  });

  it('falls back to the walk when the abandon payload names no step', () => {
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'), viewed('f', 's2'),
      ev('guideflow.tour.abandoned', { flow_id: 'f' }),
    ]);

    expect(f?.abandoned).toBe(1);
    expect(f?.steps[0]?.droppedOff).toBe(0);
    expect(f?.steps[1]?.droppedOff).toBe(1);
  });

  it('records an abandon with no step anywhere without inventing one', () => {
    const [f] = computeFunnel([
      started('f'),
      ev('guideflow.tour.abandoned', { flow_id: 'f' }),
    ]);

    expect(f?.started).toBe(1);
    expect(f?.abandoned).toBe(1);
    expect(f?.steps).toEqual([]);
  });

  it('drops an abandon that names no flow and follows no run', () => {
    expect(computeFunnel([ev('guideflow.tour.abandoned', { step_id: 's1' })])).toEqual([]);
  });

  it('ignores a step view that names no step', () => {
    const [f] = computeFunnel([
      started('f'),
      ev('guideflow.step.viewed', { flow_id: 'f' }),
      viewed('f', 's1'),
      completed('f'),
    ]);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1']);
  });

  it('records dwell from a legacy exit event carrying no flow_id', () => {
    const [f] = computeFunnel([
      started('legacy'),
      ev('guideflow.step.viewed', { step_id: 's1' }),
      ev('guideflow.step.exited', { step_id: 's1', dwell_ms: 4000 }),
      ev('guideflow.tour.completed', { flow_id: 'legacy' }),
    ]);
    expect(f?.steps[0]?.medianDwellMs).toBe(4000);
  });

  it('ignores an exit whose dwell is absent or not a finite number', () => {
    // The collector writes `dwell_ms: undefined` whenever it has no start time —
    // an exit with no matching enter, or the first step after an abandon. Those
    // must not land in the sample set as 0 ms or NaN.
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'),
      ev('guideflow.step.exited', { flow_id: 'f', step_id: 's1' }),
      ev('guideflow.step.exited', { flow_id: 'f', step_id: 's1', dwell_ms: Number.NaN }),
      ev('guideflow.step.exited', { flow_id: 'f', step_id: 's1', dwell_ms: Number.POSITIVE_INFINITY }),
      ev('guideflow.step.exited', { flow_id: 'f', step_id: 's1', dwell_ms: '500' }),
      completed('f'),
    ]);
    expect(f?.steps[0]).not.toHaveProperty('medianDwellMs');
  });

  it('ignores an exit with no step to attribute the dwell to', () => {
    const [f] = computeFunnel([
      started('f'), viewed('f', 's1'),
      ev('guideflow.step.exited', { flow_id: 'f', dwell_ms: 1234 }),
      completed('f'),
    ]);
    expect(f?.steps[0]).not.toHaveProperty('medianDwellMs');
  });

  it('ignores an exit that arrives before any tour started', () => {
    expect(computeFunnel([ev('guideflow.step.exited', { step_id: 'x', dwell_ms: 10 })])).toEqual([]);
  });

  it('attributes a legacy skip with no flow_id to the open run', () => {
    const [f] = computeFunnel([
      started('legacy'),
      ev('guideflow.step.viewed', { step_id: 's1' }),
      ev('guideflow.step.skipped', { step_id: 's1' }),
      ev('guideflow.tour.abandoned', { flow_id: 'legacy', step_id: 's1' }),
    ]);
    expect(f?.steps[0]?.skipped).toBe(1);
  });

  it('ignores a skip that names no step, and one that precedes any run', () => {
    const [f] = computeFunnel([
      ev('guideflow.step.skipped', { step_id: 'orphan' }),
      started('f'), viewed('f', 's1'),
      ev('guideflow.step.skipped', { flow_id: 'f' }),
      completed('f'),
    ]);
    expect(f?.steps.map((s) => s.stepId)).toEqual(['s1']);
    expect(f?.steps[0]?.skipped).toBe(0);
  });
});
