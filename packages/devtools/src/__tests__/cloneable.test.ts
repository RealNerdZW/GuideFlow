import { describe, it, expect, beforeEach } from 'vitest';

import { toCloneable, type ElementDescriptor } from '../cloneable.js';

/**
 * These tests exist because the failure they guard against is SILENT and
 * catastrophic: `postMessage` throwing `DataCloneError` inside the page's own
 * `step:enter` handler was caught by TourEngine's error boundary, which ended
 * the tour. Installing the extension killed every tour with a targeted step,
 * and nothing in the extension reported a problem
 * (AUDIT `bridge-dataclone-aborts-every-tour`).
 *
 * Two complementary assertions are used, for the reason explained on
 * `containsNode` below: `structuredClone` not throwing (what `postMessage`
 * does) and no DOM node surviving the transform (what makes that true in a
 * real browser, which this environment cannot simulate).
 */

/** What `postMessage` actually does to a payload. */
function isPostable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * `isPostable` is necessary but NOT sufficient here: happy-dom's elements are
 * ordinary class instances, so Node's `structuredClone` copies them happily,
 * whereas a real browser throws `DataCloneError` on a host DOM node. The
 * environment therefore cannot reproduce the original bug.
 *
 * So the invariant is asserted structurally instead: after `toCloneable`, no
 * DOM node may remain anywhere in the payload. That is what guarantees
 * `postMessage` cannot throw in a real browser, and it is checkable here.
 */
function containsNode(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== 'object') return false;
  if (value instanceof Node) return true;
  if (Array.isArray(value)) return value.some((v) => containsNode(v, depth + 1));
  return Object.values(value as Record<string, unknown>).some((v) => containsNode(v, depth + 1));
}

describe('toCloneable', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('passes plain data through unchanged', () => {
    const input = { stepId: 's1', stepIndex: 2, nested: { ok: true }, list: [1, 'a', null] };
    expect(toCloneable(input)).toEqual(input);
    expect(isPostable(toCloneable(input))).toBe(true);
  });

  it('replaces a DOM element with a descriptor', () => {
    document.body.innerHTML = '<button id="cta" class="btn primary">Go</button>';
    const el = document.querySelector('#cta')!;

    const out = toCloneable(el) as ElementDescriptor;

    expect(out.__gfElement).toBe(true);
    expect(out.tagName).toBe('button');
    expect(out.id).toBe('cta');
    expect(out.className).toBe('btn primary');
    expect(isPostable(out)).toBe(true);
  });

  it('makes a real step:enter payload postable', () => {
    // The exact shape TourEngine emits — this is the payload that killed tours.
    document.body.innerHTML = '<div id="sidebar"></div>';
    const payload = {
      event: 'step:enter',
      args: [{ stepId: 's1', stepIndex: 0, target: document.querySelector('#sidebar') }],
    };

    // The payload as emitted holds a live DOM node — this is what a real
    // browser refuses to clone, aborting the tour.
    expect(containsNode(payload)).toBe(true);

    const out = toCloneable(payload);
    expect(containsNode(out)).toBe(false);
    expect(isPostable(out)).toBe(true);

    // The target is still described, so the panel loses nothing useful.
    const arg = (out as { args: Array<Record<string, ElementDescriptor>> }).args[0]!;
    expect(arg['target']!.__gfElement).toBe(true);
    expect(arg['target']!.tagName).toBe('div');
  });

  it('makes a FlowDefinition carrying functions postable', () => {
    // listFlows() returns flows that may hold showIf guards and function content
    // (AUDIT `flows-list-clone-failure`).
    const flow = {
      id: 'welcome',
      initial: 'main',
      states: {
        main: {
          steps: [
            {
              id: 's1',
              showIf: () => true,
              content: () => ({ title: 'Async' }),
            },
          ],
          final: true,
        },
      },
    };

    expect(isPostable(flow)).toBe(false); // functions DO throw, even in happy-dom

    const out = toCloneable(flow) as {
      states: Record<string, { steps: Array<Record<string, unknown>> }>;
    };
    expect(isPostable(out)).toBe(true);

    // Functions are dropped, not stringified — the panel cannot call them anyway.
    const step = out.states['main']!.steps[0]!;
    expect(step['id']).toBe('s1');
    expect('showIf' in step).toBe(false);
    expect('content' in step).toBe(false);
  });

  it('describes a non-element node rather than cloning it', () => {
    const text = document.createTextNode('hi');
    expect(toCloneable(text)).toBe('[node]');
    expect(isPostable(toCloneable(text))).toBe(true);
  });

  it('survives a cyclic object instead of hanging or throwing', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic['self'] = cyclic;

    const out = toCloneable(cyclic);
    expect(isPostable(out)).toBe(true);
    // Depth-limited rather than reference-tracked: cheaper, and the payloads
    // this guards are shallow.
    expect(JSON.stringify(out)).toContain('[max depth]');
  });

  it('preserves Date, which structured clone handles natively', () => {
    const d = new Date('2026-07-31T00:00:00Z');
    expect(toCloneable(d)).toEqual(d);
    expect(isPostable(toCloneable(d))).toBe(true);
  });

  it('drops symbols and bigints rather than throwing', () => {
    const out = toCloneable({ ok: 1, sym: Symbol('x'), big: 10n }) as Record<string, unknown>;
    expect(out).toEqual({ ok: 1 });
    expect(isPostable(out)).toBe(true);
  });

  it('leaves every relayed GuideFlow event postable', () => {
    document.body.innerHTML = '<a id="t"></a>';
    const target = document.querySelector('#t');

    const payloads: Array<[string, unknown]> = [
      ['tour:start', { flowId: 'f1' }],
      ['tour:complete', { flowId: 'f1' }],
      ['tour:abandon', { flowId: 'f1', stepId: 's1', stepIndex: 1 }],
      ['tour:error', { flowId: 'f1', stepId: 's1', error: new Error('boom') }],
      ['step:enter', { stepId: 's1', stepIndex: 0, target }],
      ['step:exit', { stepId: 's1', stepIndex: 0 }],
      ['step:skip', { stepId: 's1' }],
      ['hotspot:open', { id: 'h1' }],
      ['hint:click', { id: 'h1' }],
      ['progress:sync', { snapshot: { flowId: 'f1', currentState: 'main', stepIndex: 0 } }],
    ];

    for (const [name, payload] of payloads) {
      const cleaned = toCloneable({ event: name, args: [payload] });
      expect(isPostable(cleaned), name).toBe(true);
      expect(containsNode(cleaned), name).toBe(false);
    }
  });
});
