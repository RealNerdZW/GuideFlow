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
})
