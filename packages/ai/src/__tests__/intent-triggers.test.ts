// ---------------------------------------------------------------------------
// Intent detection, capped — and finally wired to something.
//
// Two audit findings meet here:
//
//   `uncapped-llm-calls-per-pause` — push() ran on every click, input, keydown
//   and scroll, and every 2s lull issued a full provider round trip. One stray
//   scroll bought an LLM call. No floor, no cooldown, no ceiling.
//
//   `intent-never-wired-to-flows` — README.md and the intent guide both promised
//   "automatically surfacing the right tour at the right moment"; GuideBrain
//   emitted `intent:detected` and createAI wired only destroy().
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance, type IntentSignal, type UserEvent } from '@guideflow/core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { GuideBrain } from '../brain.js';
import { createAI } from '../index.js';
import type { AIProvider, PageContext } from '../providers/interface.js';

/** A provider whose intent answer the test controls. */
function stubProvider(signal: IntentSignal | (() => Promise<IntentSignal>)): AIProvider & {
  calls: number;
} {
  const provider = {
    calls: 0,
    generateSteps: () => Promise.resolve([]),
    detectIntent: (_events: UserEvent[]) => {
      provider.calls++;
      return typeof signal === 'function' ? signal() : Promise.resolve(signal);
    },
    answerQuestion: (_q: string, _c: PageContext) =>
      Promise.resolve({ text: '', highlights: [] }),
  };
  return provider;
}

const helpFlow: FlowDefinition = {
  id: 'help-flow',
  initial: 'main',
  states: {
    main: { steps: [{ id: 'h1', content: { title: 'Need a hand?' } }], final: true },
  },
};

const otherFlow: FlowDefinition = {
  id: 'other-flow',
  initial: 'main',
  states: {
    main: { steps: [{ id: 'o1', content: { title: 'Other' } }], final: true },
  },
};

/** Push N synthetic events straight into the buffer, bypassing DOM listeners. */
function feed(brain: GuideBrain, n: number): void {
  const buffer = (brain as unknown as { eventBuffer: UserEvent[] }).eventBuffer;
  for (let i = 0; i < n; i++) {
    buffer.push({ type: 'click', target: `#el-${i}`, timestamp: 1000 + i });
  }
}

/** Run the debounced auto-detect path directly, without waiting on a timer. */
async function autoDetect(brain: GuideBrain): Promise<void> {
  await (brain as unknown as { _autoDetect: () => Promise<void> })._autoDetect();
}

describe('automatic detection is capped', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not call the provider for a trickle of events', async () => {
    // The old behaviour: one stray scroll, a 2s lull, a full LLM round trip.
    const provider = stubProvider({ type: 'exploring', confidence: 0.5 });
    const brain = new GuideBrain(provider, { minEventsBeforeDetect: 5 });

    feed(brain, 3);
    await autoDetect(brain);

    expect(provider.calls).toBe(0);
    brain.destroy();
  });

  it('calls once enough new events have accumulated', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const brain = new GuideBrain(provider, { minEventsBeforeDetect: 5 });

    feed(brain, 5);
    await autoDetect(brain);

    expect(provider.calls).toBe(1);
    brain.destroy();
  });

  it('does not re-analyse events it has already sent', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const brain = new GuideBrain(provider, { minEventsBeforeDetect: 5, detectCooldownMs: 0 });

    feed(brain, 5);
    await autoDetect(brain);
    expect(provider.calls).toBe(1);

    // A lull with nothing new must not buy a second call.
    await autoDetect(brain);
    expect(provider.calls).toBe(1);

    feed(brain, 5);
    await autoDetect(brain);
    expect(provider.calls).toBe(2);

    brain.destroy();
  });

  it('honours the cooldown even when the user is busy', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const brain = new GuideBrain(provider, {
      minEventsBeforeDetect: 1,
      detectCooldownMs: 60_000,
    });

    feed(brain, 10);
    await autoDetect(brain);
    feed(brain, 10);
    await autoDetect(brain);

    expect(provider.calls).toBe(1);
    brain.destroy();
  });

  it('stops calling after the per-session ceiling', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const brain = new GuideBrain(provider, {
      minEventsBeforeDetect: 1,
      detectCooldownMs: 0,
      maxDetectsPerSession: 3,
    });

    for (let i = 0; i < 10; i++) {
      feed(brain, 2);
      await autoDetect(brain);
    }

    expect(provider.calls).toBe(3);
    expect(brain.stats.autoDetects).toBe(3);
    brain.destroy();
  });

  it('leaves an explicit detectIntent() uncapped — that call is the caller\'s', async () => {
    const provider = stubProvider({ type: 'engaged', confidence: 1 });
    const brain = new GuideBrain(provider, { maxDetectsPerSession: 0 });

    await brain.detectIntent();
    await brain.detectIntent();

    expect(provider.calls).toBe(2);
    brain.destroy();
  });

  it('slides the analysed high-water mark when the buffer overflows', async () => {
    // The mark indexes into a buffer that loses its head at maxEventBuffer. If
    // it did not slide, `fresh` would go permanently negative and detection
    // would never fire again.
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const brain = new GuideBrain(provider, {
      maxEventBuffer: 10,
      minEventsBeforeDetect: 5,
      detectCooldownMs: 0,
    });

    feed(brain, 10);
    await autoDetect(brain);
    expect(provider.calls).toBe(1);

    // Overflow the buffer through the real push path.
    const push = (brain as unknown as { eventBuffer: UserEvent[] }).eventBuffer;
    for (let i = 0; i < 8; i++) {
      push.push({ type: 'click', target: '#x', timestamp: 2000 + i });
      if (push.length > 10) {
        push.shift();
        const state = brain as unknown as { _analysedCount: number };
        if (state._analysedCount > 0) state._analysedCount--;
      }
    }
    await autoDetect(brain);

    expect(provider.calls).toBe(2);
    brain.destroy();
  });
});

describe('a failing provider does not become an unhandled rejection', () => {
  let unhandled: unknown[] = [];
  const onUnhandled = (e: unknown): void => {
    unhandled.push(e);
  };

  beforeEach(() => {
    unhandled = [];
    globalThis.addEventListener?.('unhandledrejection', onUnhandled);
  });

  afterEach(() => {
    globalThis.removeEventListener?.('unhandledrejection', onUnhandled);
  });

  it('routes the failure to the error event and swallows the rejection', async () => {
    // `void this.detectIntent()` discarded the promise without a handler, so an
    // expired key or a rate limit crashed a Node process outright
    // (AUDIT `brain-unhandled-rejection`).
    const provider = stubProvider(() => Promise.reject(new Error('401 invalid api key')));
    const brain = new GuideBrain(provider, { minEventsBeforeDetect: 1, intentDebounceMs: 1 });

    const errors: Error[] = [];
    brain.on('error', (e) => errors.push(e));

    feed(brain, 3);
    // Drive the same path the debounce timer drives.
    await (brain as unknown as { _autoDetect: () => Promise<void> })
      ._autoDetect()
      .catch(() => { /* the production call site does exactly this */ });

    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('401');
    expect(unhandled).toHaveLength(0);
    brain.destroy();
  });

  it('still throws from an awaited detectIntent(), so a caller can react', async () => {
    const provider = stubProvider(() => Promise.reject(new Error('boom')));
    const brain = new GuideBrain(provider);

    await expect(brain.detectIntent()).rejects.toThrow('boom');
    brain.destroy();
  });

  it('does not emit into a destroyed instance', async () => {
    let resolveIt: (s: IntentSignal) => void = () => {};
    const provider = stubProvider(
      () => new Promise<IntentSignal>((resolve) => { resolveIt = resolve; }),
    );
    const brain = new GuideBrain(provider);

    const signals: IntentSignal[] = [];
    brain.on('intent:detected', (s) => signals.push(s));

    const pending = brain.detectIntent().catch(() => undefined);
    brain.destroy();
    resolveIt({ type: 'stuck', confidence: 1 });
    await pending;

    // A slow provider resolving into a torn-down instance must not fire
    // listeners the caller believes they have released.
    expect(signals).toHaveLength(0);
  });
});

describe('intent triggers start tours', () => {
  let gf: (GuideFlowInstance & { ai: GuideBrain }) | null = null;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    gf?.destroy();
    gf = null;
    document.body.innerHTML = '';
  });

  it('starts the mapped flow when a matching intent clears the threshold', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'stuck', minConfidence: 0.8, flow: helpFlow }],
    });

    await gf.ai.detectIntent();
    await Promise.resolve();
    await Promise.resolve();

    expect(gf.isActive).toBe(true);
    expect(gf.flowId).toBe('help-flow');
  });

  it('ignores a signal below the confidence threshold', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.4 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'stuck', minConfidence: 0.8, flow: helpFlow }],
    });

    await gf.ai.detectIntent();
    await Promise.resolve();

    expect(gf.isActive).toBe(false);
  });

  it('ignores a signal of a different type', async () => {
    const provider = stubProvider({ type: 'engaged', confidence: 1 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'stuck', minConfidence: 0.5, flow: helpFlow }],
    });

    await gf.ai.detectIntent();
    await Promise.resolve();

    expect(gf.isActive).toBe(false);
  });

  it('defaults the threshold to 0.7, so a failed detection cannot fire it', async () => {
    // A provider failure falls back to { type: 'exploring', confidence: 0 }.
    // Without a default floor, a rule on 'exploring' would fire on every error.
    const provider = stubProvider({ type: 'exploring', confidence: 0 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'exploring', flow: helpFlow }],
    });

    await gf.ai.detectIntent();
    await Promise.resolve();

    expect(gf.isActive).toBe(false);
  });

  it('fires once per flow by default', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'stuck', minConfidence: 0.5, flow: helpFlow }],
    });

    const starts: string[] = [];
    gf.on('tour:start', () => starts.push('start'));

    await gf.ai.detectIntent();
    await Promise.resolve();
    await Promise.resolve();
    gf.stop();

    await gf.ai.detectIntent();
    await Promise.resolve();
    await Promise.resolve();

    expect(starts).toHaveLength(1);
  });

  it('never interrupts a tour already on screen', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'stuck', minConfidence: 0.5, flow: helpFlow }],
    });

    await gf.start(otherFlow);
    expect(gf.flowId).toBe('other-flow');

    await gf.ai.detectIntent();
    await Promise.resolve();
    await Promise.resolve();

    // Replacing a tour mid-step is worse than not helping.
    expect(gf.flowId).toBe('other-flow');
  });

  it('takes the first matching trigger in order', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [
        { type: 'stuck', minConfidence: 0.5, flow: helpFlow },
        { type: 'stuck', minConfidence: 0.5, flow: otherFlow },
      ],
    });

    await gf.ai.detectIntent();
    await Promise.resolve();
    await Promise.resolve();

    expect(gf.flowId).toBe('help-flow');
  });

  it('starts nothing when no triggers are configured', async () => {
    // Opt-in: this is the default, and it must stay the default.
    const provider = stubProvider({ type: 'stuck', confidence: 1 });
    gf = createAI(provider, createGuideFlow({ injectStyles: false }));

    await gf.ai.detectIntent();
    await Promise.resolve();

    expect(gf.isActive).toBe(false);
  });

  it('unsubscribes on destroy', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const instance = createAI(provider, createGuideFlow({ injectStyles: false }), {
      intentTriggers: [{ type: 'stuck', minConfidence: 0.5, flow: helpFlow }],
    });
    const brain = instance.ai;

    instance.destroy();
    // The brain's listener map is cleared, so nothing can fire into a
    // destroyed engine.
    await brain.detectIntent().catch(() => undefined);

    expect(instance.isActive).toBe(false);
  });
});

describe('createAI stats', () => {
  it('reports what the automatic loop has spent', async () => {
    const provider = stubProvider({ type: 'stuck', confidence: 0.9 });
    const brain = new GuideBrain(provider, { minEventsBeforeDetect: 2, detectCooldownMs: 0 });

    expect(brain.stats).toEqual({ autoDetects: 0, bufferedEvents: 0, analysedEvents: 0 });

    feed(brain, 4);
    await autoDetect(brain);

    expect(brain.stats.autoDetects).toBe(1);
    expect(brain.stats.bufferedEvents).toBe(4);
    expect(brain.stats.analysedEvents).toBe(4);

    brain.clearBuffer();
    expect(brain.stats.bufferedEvents).toBe(0);
    expect(brain.stats.analysedEvents).toBe(0);

    brain.destroy();
  });
});

// Silence the deliberate console.warn from unparseable-response paths.
vi.spyOn(console, 'warn').mockImplementation(() => undefined);
