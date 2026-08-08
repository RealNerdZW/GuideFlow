import type { GuideFlowInstance } from '@guideflow/core'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { AnalyticsCollector } from '../collector.js'
import type { AnalyticsEvent } from '../transports/interface.js'

function createMockTransport() {
  const events: AnalyticsEvent[] = []
  return {
    name: 'mock',
    events,
    track(event: AnalyticsEvent) {
      events.push(event)
    },
    flush: vi.fn<[], void | Promise<void>>(),
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (payload: any) => void

function createMockGuideFlow() {
  const handlers = new Map<string, Set<AnyHandler>>()
  return {
    on(event: string, handler: AnyHandler) {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event)!.add(handler)
      return () => handlers.get(event)?.delete(handler)
    },
    emit(event: string, payload: unknown) {
      handlers.get(event)?.forEach((fn) => fn(payload))
    },
    handlers,
  }
}

/** Cast the lightweight mock to the full instance type expected by `attach()`. */
function asInstance(mock: ReturnType<typeof createMockGuideFlow>): GuideFlowInstance {
  return mock as unknown as GuideFlowInstance
}

describe('AnalyticsCollector', () => {
  let collector: AnalyticsCollector
  let transport: ReturnType<typeof createMockTransport>
  let gf: ReturnType<typeof createMockGuideFlow>

  beforeEach(() => {
    transport = createMockTransport()
    collector = new AnalyticsCollector({ userId: 'user-123', globalProperties: { env: 'test' } })
    collector.addTransport(transport)
    gf = createMockGuideFlow()
  })

  afterEach(() => {
    collector.detach()
  })

  it('subscribes to GuideFlow events on attach()', () => {
    collector.attach(asInstance(gf))
    // Should have registered handlers for tour:start, tour:complete, tour:abandon, step:enter, step:exit, step:skip
    expect(gf.handlers.size).toBeGreaterThanOrEqual(6)
  })

  it('tracks tour:start as guideflow.tour.started', () => {
    collector.attach(asInstance(gf))
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(1)
    expect(transport.events[0]!.event).toBe('guideflow.tour.started')
    expect(transport.events[0]!.properties['flow_id']).toBe('flow-1')
    expect(transport.events[0]!.properties['user_id']).toBe('user-123')
  })

  it('tracks tour:complete as guideflow.tour.completed', () => {
    collector.attach(asInstance(gf))
    gf.emit('tour:complete', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(1)
    expect(transport.events[0]!.event).toBe('guideflow.tour.completed')
  })

  it('tracks tour:abandon as guideflow.tour.abandoned', () => {
    collector.attach(asInstance(gf))
    gf.emit('tour:abandon', { flowId: 'flow-1', stepId: 's1', stepIndex: 2 })
    expect(transport.events).toHaveLength(1)
    expect(transport.events[0]!.event).toBe('guideflow.tour.abandoned')
    expect(transport.events[0]!.properties['step_id']).toBe('s1')
  })

  it('tracks step:enter as guideflow.step.viewed', () => {
    collector.attach(asInstance(gf))
    gf.emit('step:enter', { stepId: 's1', stepIndex: 0, target: null })
    expect(transport.events).toHaveLength(1)
    expect(transport.events[0]!.event).toBe('guideflow.step.viewed')
  })

  it('tracks step:exit as guideflow.step.exited with dwell time', () => {
    collector.attach(asInstance(gf))
    gf.emit('step:enter', { stepId: 's1', stepIndex: 0, target: null })
    // Simulate some time passing
    gf.emit('step:exit', { stepId: 's1', stepIndex: 0 })
    const exitEvent = transport.events.find((e) => e.event === 'guideflow.step.exited')
    expect(exitEvent).toBeDefined()
    expect(exitEvent!.properties['dwell_ms']).toBeDefined()
  })

  it('tracks step:skip as guideflow.step.skipped', () => {
    collector.attach(asInstance(gf))
    gf.emit('step:skip', { stepId: 's2' })
    expect(transport.events).toHaveLength(1)
    expect(transport.events[0]!.event).toBe('guideflow.step.skipped')
  })

  it('includes globalProperties in every event', () => {
    collector.attach(asInstance(gf))
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events[0]!.properties['env']).toBe('test')
  })

  it('includes timestamp in ISO format', () => {
    collector.attach(asInstance(gf))
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('addTransport() returns this for chaining', () => {
    const c = new AnalyticsCollector()
    const result = c.addTransport(transport)
    expect(result).toBe(c)
  })

  it('detach() removes all event subscriptions', () => {
    collector.attach(asInstance(gf))
    collector.detach()
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(0)
  })

  it('attach() returns an unsubscribe function', () => {
    const detach = collector.attach(asInstance(gf))
    detach()
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(0)
  })

  it('flush() calls flush on all transports', async () => {
    collector.addTransport(transport) // double-add is fine
    await collector.flush()
    expect(transport.flush).toHaveBeenCalled()
  })

  it('forwards to multiple transports', () => {
    const transport2 = createMockTransport()
    collector.addTransport(transport2)
    collector.attach(asInstance(gf))
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(1)
    expect(transport2.events).toHaveLength(1)
  })

  it('ignores a second attach(), and its return value still detaches', () => {
    // A duplicate subscription doubles every event, which silently doubles every
    // count downstream. The second call is a no-op — but it still has to hand
    // back a working unsubscribe, or a caller that only kept the second one
    // leaks the subscription for the life of the page.
    collector.attach(asInstance(gf))
    const detachAgain = collector.attach(asInstance(gf))

    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(1)

    detachAgain()
    gf.emit('tour:start', { flowId: 'flow-1' })
    expect(transport.events).toHaveLength(1)
  })

  it('warns and keeps going when a transport throws', () => {
    // One broken transport must not silence the others, and must not take the
    // engine's event handler down with it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const good = createMockTransport()
    const c = new AnalyticsCollector()
      .addTransport({ name: 'bad', track() { throw new Error('boom') } })
      .addTransport(good)

    c.attach(asInstance(gf))
    expect(() => gf.emit('tour:start', { flowId: 'flow-1' })).not.toThrow()

    expect(good.events).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Transport "bad" threw:'),
      expect.any(Error),
    )
    c.detach()
    warn.mockRestore()
  })

  it('emits no dwell for an exit with no matching enter', () => {
    collector.attach(asInstance(gf))
    gf.emit('step:exit', { stepId: 's1', stepIndex: 0 })
    const exited = transport.events.find((e) => e.event === 'guideflow.step.exited')
    expect(exited).toBeDefined()
    expect(exited!.properties['dwell_ms']).toBeUndefined()
  })

  it('does not let a tour inherit dwell time from an abandoned one', () => {
    // tour:abandon clears the step timer. Without that, the next tour's first
    // exit reports the wall-clock gap between the two tours as dwell — which
    // could be hours, and would move the median for that step.
    collector.attach(asInstance(gf))
    gf.emit('tour:start', { flowId: 'a' })
    gf.emit('step:enter', { stepId: 's1', stepIndex: 0, target: null })
    gf.emit('tour:abandon', { flowId: 'a', stepId: 's1', stepIndex: 0 })

    gf.emit('tour:start', { flowId: 'b' })
    gf.emit('step:exit', { stepId: 's1', stepIndex: 0 })

    const exited = transport.events.find((e) => e.event === 'guideflow.step.exited')
    expect(exited?.properties['dwell_ms']).toBeUndefined()
  })

  it('omits url and referrer where there is no DOM', () => {
    // The collector is imported by Nuxt/Next/SvelteKit users. `base()` reads
    // window and document, and touching either unguarded on a server is a
    // ReferenceError that takes the render down — not an undefined field.
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    try {
      const t = createMockTransport()
      const c = new AnalyticsCollector().addTransport(t)
      c.attach(asInstance(gf))

      expect(() => gf.emit('tour:start', { flowId: 'flow-1' })).not.toThrow()
      expect(t.events).toHaveLength(1)
      expect(t.events[0]!.properties['url']).toBeUndefined()
      expect(t.events[0]!.properties['referrer']).toBeUndefined()
      expect(t.events[0]!.properties['flow_id']).toBe('flow-1')
      c.detach()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('flush() tolerates a transport that does not implement it', async () => {
    const c = new AnalyticsCollector().addTransport({ name: 'no-flush', track() { /* drops */ } })
    await expect(c.flush()).resolves.toBeUndefined()
  })

  it('flush() settles even when one transport rejects', async () => {
    const good = createMockTransport()
    const c = new AnalyticsCollector()
      .addTransport({ name: 'rejects', track() { /* noop */ }, flush: () => Promise.reject(new Error('nope')) })
      .addTransport(good)

    await expect(c.flush()).resolves.toBeUndefined()
    expect(good.flush).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// track() — the public door onto send().
//
// send() is private and is the ONLY path through PrivacyPolicy: consent,
// Do-Not-Track, sampling, URL scrubbing, key redaction. A custom event that did
// not go through it would bypass all of Phase 3.5 — so these assert it goes
// *through* send(), not around it.
// ---------------------------------------------------------------------------

describe('track()', () => {
  it('reaches every transport with an ISO timestamp', () => {
    const a = createMockTransport()
    const b = createMockTransport()
    const collector = new AnalyticsCollector({ userId: 'u1' })
      .addTransport(a)
      .addTransport(b);

    collector.track('custom.event', { surface: 'billing' });

    for (const t of [a, b]) {
      expect(t.events).toHaveLength(1);
      expect(t.events[0]?.event).toBe('custom.event');
      expect(t.events[0]?.properties['surface']).toBe('billing');
      expect(t.events[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('honours the consent gate', () => {
    const t = createMockTransport()
    const collector = new AnalyticsCollector({
      userId: 'u1',
      privacy: { consent: false },
    }).addTransport(t)

    collector.track('custom.event')
    expect(t.events).toHaveLength(0)

    collector.setConsent(true)
    collector.track('custom.event')
    expect(t.events).toHaveLength(1)
  });

  it('redacts a sensitive property key', () => {
    // Proof that it goes through send() rather than around it.
    const t = createMockTransport()
    const collector = new AnalyticsCollector({ userId: 'u1' }).addTransport(t);

    collector.track('custom.event', { password: 'hunter2' });

    expect(t.events[0]?.properties['password']).not.toBe('hunter2');
  });

  it('scrubs a url query string', () => {
    const t = createMockTransport()
    const collector = new AnalyticsCollector({ userId: 'u1' }).addTransport(t);

    collector.track('custom.event', { url: 'https://app.test/x?token=secret' });

    expect(String(t.events[0]?.properties['url'])).not.toContain('secret');
  });

  it('lets per-event properties beat globalProperties', () => {
    const t = createMockTransport()
    const collector = new AnalyticsCollector({
      userId: 'u1',
      globalProperties: { surface: 'global', tier: 'free' },
    }).addTransport(t);

    collector.track('custom.event', { surface: 'override' });

    expect(t.events[0]?.properties['surface']).toBe('override');
    expect(t.events[0]?.properties['tier']).toBe('free');
  });

  it('carries user_id like every other event', () => {
    const t = createMockTransport()
    new AnalyticsCollector({ userId: 'u42' }).addTransport(t).track('custom.event')
    expect(t.events[0]?.properties['user_id']).toBe('u42');
  });
});

describe('step events name their flow', () => {
  // The engine puts only a `stepId` on `step:enter` / `step:exit` / `step:skip`,
  // so every step event used to ship `flow_id: undefined`. A step id is only
  // unique *within* a flow, so a downstream funnel or dashboard had to infer
  // the flow from surrounding `tour.started` events and hope the stream was in
  // order — which a merged multi-transport export is not.
  let collector: AnalyticsCollector
  let transport: ReturnType<typeof createMockTransport>
  let gf: ReturnType<typeof createMockGuideFlow>

  beforeEach(() => {
    transport = createMockTransport()
    collector = new AnalyticsCollector()
    collector.addTransport(transport)
    gf = createMockGuideFlow()
    collector.attach(asInstance(gf))
  })

  afterEach(() => { collector.detach() })

  const flowOf = (name: string): unknown =>
    transport.events.find((e) => e.event === name)?.properties['flow_id']

  it('stamps the running flow onto viewed, exited and skipped', () => {
    gf.emit('tour:start', { flowId: 'onboarding' })
    gf.emit('step:enter', { stepId: 's1', stepIndex: 0, target: null })
    gf.emit('step:exit', { stepId: 's1', stepIndex: 0 })
    gf.emit('step:skip', { stepId: 's1' })

    expect(flowOf('guideflow.step.viewed')).toBe('onboarding')
    expect(flowOf('guideflow.step.exited')).toBe('onboarding')
    expect(flowOf('guideflow.step.skipped')).toBe('onboarding')
  })

  it('does not leak the previous flow onto the next one', () => {
    gf.emit('tour:start', { flowId: 'first' })
    gf.emit('step:enter', { stepId: 'a', stepIndex: 0, target: null })
    gf.emit('tour:complete', { flowId: 'first' })

    gf.emit('tour:start', { flowId: 'second' })
    gf.emit('step:enter', { stepId: 'b', stepIndex: 0, target: null })

    const viewed = transport.events.filter((e) => e.event === 'guideflow.step.viewed')
    expect(viewed.map((e) => e.properties['flow_id'])).toEqual(['first', 'second'])
  })

  it('leaves flow_id undefined for a step with no tour open', () => {
    // Rather than guessing. An orphan step event is a real thing — a detach
    // mid-tour, or a host emitting on the instance directly — and inventing an
    // attribution for it would be worse than admitting we do not know.
    gf.emit('step:enter', { stepId: 'orphan', stepIndex: 0, target: null })
    expect(flowOf('guideflow.step.viewed')).toBeUndefined()
  })
})
