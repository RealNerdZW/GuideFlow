/**
 * `computeFunnel` — per-step drop-off from the events the collector already emits.
 *
 * `AnalyticsCollector` emits everything a funnel needs and leaves the
 * arithmetic to whoever receives the events. That is the right split — a
 * library has no business running a dashboard — but it means the one number
 * everybody actually asks for, *where do people give up*, requires each host to
 * write the same reduction.
 *
 * This is that reduction, as a pure function. Events in, drop-off out. No
 * storage, no network, no backend, and nothing reaches `@guideflow/core`.
 *
 * ```ts
 * import { computeFunnel } from '@guideflow/analytics'
 *
 * const [funnel] = computeFunnel(events)
 * funnel.steps.find((s) => s.dropOffRate > 0.3)   // where the tour loses people
 * ```
 *
 * ## What it can and cannot tell you
 *
 * It reduces **one client's event stream**. Aggregating across sessions and
 * users is your warehouse's job, and pretending otherwise would be inventing a
 * backend this project decided against. Feed it a day of one browser's events
 * and it is exact; feed it a merged multi-user export and it is still exact,
 * provided the events are in order.
 */
import type { AnalyticsEvent } from './transports/interface.js';

export interface FunnelStep {
  stepId: string;
  /** Runs that reached this step. */
  reached: number;
  /** Runs whose **last** step was this one and which did not complete. */
  droppedOff: number;
  /** `droppedOff / reached`, 0–1. `0` when nothing reached it. */
  dropOffRate: number;
  /** Runs that explicitly skipped from this step. A subset of `droppedOff`. */
  skipped: number;
  /** Median ms on the step, from `dwell_ms`. Absent when none was recorded. */
  medianDwellMs?: number;
}

export interface Funnel {
  flowId: string;
  /** Runs that emitted `tour.started`. */
  started: number;
  completed: number;
  /** Runs that emitted `tour.abandoned`. */
  abandoned: number;
  /**
   * Runs that started and emitted no ending at all — the tab was closed, or the
   * export was cut mid-session. Counted separately rather than folded into
   * `abandoned`, because "the user gave up" and "we stopped listening" are
   * different facts and only the first is worth acting on.
   */
  unfinished: number;
  /** `completed / started`, 0–1. */
  completionRate: number;
  /** In first-seen order, which is the only order the events can justify. */
  steps: FunnelStep[];
}

export interface ComputeFunnelOptions {
  /** Only this flow. Omit for one funnel per flow seen. */
  flowId?: string;
}

const STARTED = 'guideflow.tour.started';
const COMPLETED = 'guideflow.tour.completed';
const ABANDONED = 'guideflow.tour.abandoned';
const VIEWED = 'guideflow.step.viewed';
const EXITED = 'guideflow.step.exited';
const SKIPPED = 'guideflow.step.skipped';

interface Acc {
  flowId: string;
  started: number;
  completed: number;
  abandoned: number;
  unfinished: number;
  order: string[];
  reached: Map<string, number>;
  droppedOff: Map<string, number>;
  skipped: Map<string, number>;
  dwell: Map<string, number[]>;
}

const bump = (m: Map<string, number>, k: string): void => { m.set(k, (m.get(k) ?? 0) + 1); };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  // `noUncheckedIndexedAccess` — and an empty array never reaches here.
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
};

/**
 * Reduce a collector event stream into per-flow, per-step drop-off.
 *
 * **Order matters, and the events are sorted by `timestamp` first** — a stream
 * merged from several transports, or read back out of storage, arrives in
 * whatever order the merge produced. `Array.prototype.sort` is stable, so
 * events sharing a millisecond keep the order they were given, which is the
 * only tie-break available and the correct one: the collector emits them
 * synchronously in engine order.
 *
 * Attribution prefers each event's own `flow_id`. Step events only started
 * carrying it alongside this function; older streams have `undefined` there, so
 * a step falls back to whichever tour is open at that point in the walk. That
 * fallback is why the walk is sequential rather than a group-by.
 */
export function computeFunnel(
  events: readonly AnalyticsEvent[],
  options: ComputeFunnelOptions = {},
): Funnel[] {
  const ordered = [...events].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  const flows = new Map<string, Acc>();
  const acc = (flowId: string): Acc => {
    let a = flows.get(flowId);
    if (!a) {
      a = {
        flowId,
        started: 0, completed: 0, abandoned: 0, unfinished: 0,
        order: [],
        reached: new Map(), droppedOff: new Map(), skipped: new Map(), dwell: new Map(),
      };
      flows.set(flowId, a);
    }
    return a;
  };

  /** The run in progress: the engine never runs two tours at once. */
  let openFlow: string | null = null;
  let lastStep: string | null = null;

  /** A run ended without completing — charge the drop-off to its last step. */
  const closeRun = (completed: boolean): void => {
    if (openFlow !== null && lastStep !== null && !completed) {
      bump(acc(openFlow).droppedOff, lastStep);
    }
    openFlow = null;
    lastStep = null;
  };

  for (const e of ordered) {
    const evFlow = str(e.properties['flow_id']);
    const stepId = str(e.properties['step_id']);

    switch (e.event) {
      case STARTED: {
        if (evFlow === undefined) break;
        // A second `started` with no ending means the previous run was cut off.
        if (openFlow !== null) {
          acc(openFlow).unfinished += 1;
          closeRun(false);
        }
        openFlow = evFlow;
        lastStep = null;
        acc(evFlow).started += 1;
        break;
      }
      case COMPLETED: {
        const f = evFlow ?? openFlow;
        if (f !== null && f !== undefined) acc(f).completed += 1;
        closeRun(true);
        break;
      }
      case ABANDONED: {
        const f = evFlow ?? openFlow;
        if (f !== null && f !== undefined) acc(f).abandoned += 1;
        // The abandon payload names the step the user was on, which beats the
        // walk's guess when a stream is partial.
        if (f !== null && f !== undefined && (stepId ?? lastStep) !== null) {
          bump(acc(f).droppedOff, (stepId ?? lastStep) as string);
        }
        openFlow = null;
        lastStep = null;
        break;
      }
      case VIEWED: {
        const f = evFlow ?? openFlow;
        if (f === null || f === undefined || stepId === undefined) break;
        const a = acc(f);
        if (!a.reached.has(stepId)) a.order.push(stepId);
        bump(a.reached, stepId);
        lastStep = stepId;
        break;
      }
      case EXITED: {
        const f = evFlow ?? openFlow;
        const dwell = e.properties['dwell_ms'];
        if (f === null || f === undefined || stepId === undefined) break;
        if (typeof dwell === 'number' && Number.isFinite(dwell)) {
          const a = acc(f);
          const xs = a.dwell.get(stepId);
          if (xs) xs.push(dwell);
          else a.dwell.set(stepId, [dwell]);
        }
        break;
      }
      case SKIPPED: {
        const f = evFlow ?? openFlow;
        if (f === null || f === undefined || stepId === undefined) break;
        bump(acc(f).skipped, stepId);
        break;
      }
      default:
        break;
    }
  }

  // A stream that ends mid-tour. The user did not necessarily give up — we
  // stopped listening — so it is counted apart from `abandoned`, but the step
  // they were last on is still where the funnel lost them.
  if (openFlow !== null) {
    acc(openFlow).unfinished += 1;
    closeRun(false);
  }

  const out: Funnel[] = [];
  for (const a of flows.values()) {
    if (options.flowId !== undefined && a.flowId !== options.flowId) continue;
    out.push({
      flowId: a.flowId,
      started: a.started,
      completed: a.completed,
      abandoned: a.abandoned,
      unfinished: a.unfinished,
      completionRate: a.started === 0 ? 0 : a.completed / a.started,
      steps: a.order.map((stepId) => {
        const reached = a.reached.get(stepId) ?? 0;
        const droppedOff = a.droppedOff.get(stepId) ?? 0;
        const xs = a.dwell.get(stepId);
        return {
          stepId,
          reached,
          droppedOff,
          dropOffRate: reached === 0 ? 0 : droppedOff / reached,
          skipped: a.skipped.get(stepId) ?? 0,
          ...(xs !== undefined && xs.length > 0 && { medianDwellMs: median(xs) }),
        };
      }),
    });
  }

  return out.sort((x, y) => y.started - x.started);
}
