import { describe, it, expect, vi, afterEach } from 'vitest'

import { AmplitudeTransport } from '../transports/amplitude.js'
import type { AnalyticsEvent, AnalyticsTransport } from '../transports/interface.js'
import { MixpanelTransport } from '../transports/mixpanel.js'
import { PostHogTransport } from '../transports/posthog.js'
import { SegmentTransport } from '../transports/segment.js'

/** Signature every provider global exposes (posthog.capture / mixpanel.track / …). */
type ProviderFn = (event: string, props?: Record<string, unknown>) => void

interface TransportSpec {
  /** Class name, used as the describe label. */
  label: string
  /** Value the transport must expose as `transport.name`. */
  name: string
  /** The `window.<globalName>` object the transport looks for. */
  globalName: string
  /** Method invoked on that global. */
  method: string
  /** Property key the transport writes `event.timestamp` under. */
  timestampKey: string
  create: () => AnalyticsTransport
}

const SPECS: TransportSpec[] = [
  {
    label: 'PostHogTransport',
    name: 'posthog',
    globalName: 'posthog',
    method: 'capture',
    timestampKey: '$timestamp',
    create: () => new PostHogTransport(),
  },
  {
    label: 'MixpanelTransport',
    name: 'mixpanel',
    globalName: 'mixpanel',
    method: 'track',
    timestampKey: 'time',
    create: () => new MixpanelTransport(),
  },
  {
    label: 'AmplitudeTransport',
    name: 'amplitude',
    globalName: 'amplitude',
    method: 'track',
    timestampKey: 'time',
    create: () => new AmplitudeTransport(),
  },
  {
    label: 'SegmentTransport',
    name: 'segment',
    globalName: 'analytics',
    method: 'track',
    timestampKey: 'timestamp',
    create: () => new SegmentTransport(),
  },
]

const TIMESTAMP = '2026-07-30T12:00:00.000Z'

function makeEvent(event = 'guideflow.tour.started'): AnalyticsEvent {
  return {
    event,
    timestamp: TIMESTAMP,
    properties: { flow_id: 'onboarding', step_id: 's1' },
  }
}

/** Install a fake provider global (under happy-dom `globalThis` *is* `window`). */
function stubProvider(spec: TransportSpec, fn: ProviderFn): void {
  vi.stubGlobal(spec.globalName, { [spec.method]: fn })
}

/** Guarantee the provider global is absent. */
function removeProvider(spec: TransportSpec): void {
  vi.stubGlobal(spec.globalName, undefined)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each(SPECS)('$label', (spec) => {
  it(`exposes name "${spec.name}"`, () => {
    expect(spec.create().name).toBe(spec.name)
  })

  it('forwards the event name to the provider global', async () => {
    const fn = vi.fn<[string, Record<string, unknown>?], void>()
    stubProvider(spec, fn)

    await spec.create().track(makeEvent('guideflow.step.viewed'))

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0]![0]).toBe('guideflow.step.viewed')
  })

  it('forwards event properties plus the timestamp under the provider-specific key', async () => {
    const fn = vi.fn<[string, Record<string, unknown>?], void>()
    stubProvider(spec, fn)

    await spec.create().track(makeEvent())

    expect(fn).toHaveBeenCalledWith('guideflow.tour.started', {
      flow_id: 'onboarding',
      step_id: 's1',
      [spec.timestampKey]: TIMESTAMP,
    })
  })

  it('reads the provider global lazily, so it may be loaded after the transport', async () => {
    // Constructed while the global is absent — the transport must not cache that.
    const transport = spec.create()
    const fn = vi.fn<[string, Record<string, unknown>?], void>()
    stubProvider(spec, fn)

    await transport.track(makeEvent())

    expect(fn).toHaveBeenCalledTimes(1)
  })

  // AUDIT `transports-silent-noop`: with no provider global present the event is
  // dropped without any diagnostic. That is today's documented behaviour; these
  // assertions exist so the Phase 5 change (surface a warning) breaks them loudly.
  describe('when the provider global is absent', () => {
    it('does not throw', () => {
      removeProvider(spec)
      const transport = spec.create()

      expect(() => transport.track(makeEvent())).not.toThrow()
    })

    it('drops the event — no provider call, no console.warn, no console.error', async () => {
      // Install the provider first and then remove it, so that "was not called"
      // is a real signal rather than an artefact of a global that never existed.
      const fn = vi.fn<[string, Record<string, unknown>?], void>()
      stubProvider(spec, fn)
      const transport = spec.create()
      removeProvider(spec)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      await transport.track(makeEvent())

      expect(fn).not.toHaveBeenCalled()
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('returns undefined rather than a rejected promise', () => {
      removeProvider(spec)

      expect(spec.create().track(makeEvent())).toBeUndefined()
    })
  })
})
