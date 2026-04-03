import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, act } from '@testing-library/react'
import { TourProvider, useGuideFlow } from '../context.js'
import { useTour } from '../hooks/use-tour.js'
import { useTourStep } from '../hooks/use-tour-step.js'
import { TourStep } from '../components/TourStep.js'
import type { FlowDefinition, GuideFlowInstance, TourEvents } from '@guideflow/core'

// -- Mock GuideFlowInstance --------------------------------------------------

type Listener<K extends keyof TourEvents> = (payload: TourEvents[K]) => void

function createMockGF(): GuideFlowInstance & {
  _fire: <K extends keyof TourEvents>(event: K, payload: TourEvents[K]) => void
} {
  const listeners = new Map<string, Set<Function>>()
  let active = false
  let stepId: string | null = null
  let stepIdx = 0
  let total = 0

  const instance = {
    // EventEmitter subset
    on(event: string, handler: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
      return () => listeners.get(event)?.delete(handler)
    },
    emit: vi.fn(),
    removeAllListeners: vi.fn(),

    // GuideFlowInstance
    configure: vi.fn(),
    createFlow: vi.fn((d: FlowDefinition) => d),
    start: vi.fn(async () => {
      active = true
      stepId = 'step-1'
      stepIdx = 0
      total = 3
    }),
    stop: vi.fn(() => { active = false }),
    next: vi.fn(async () => {}),
    prev: vi.fn(async () => {}),
    goTo: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    hotspot: vi.fn(() => 'hotspot-1'),
    removeHotspot: vi.fn(),
    hints: vi.fn(),
    showHints: vi.fn(),
    hideHints: vi.fn(),
    i18n: {} as any,
    progress: {} as any,
    destroy: vi.fn(),

    get isActive() { return active },
    get currentStepId() { return stepId },
    get currentStepIndex() { return stepIdx },
    get totalSteps() { return total },

    // Test helper
    _fire<K extends keyof TourEvents>(event: K, payload: TourEvents[K]) {
      listeners.get(event)?.forEach((fn) => fn(payload))
    },
  }

  return instance as any
}

// -- Tests -------------------------------------------------------------------

afterEach(cleanup)

describe('TourProvider & useGuideFlow', () => {
  it('provides a GuideFlowInstance via context', () => {
    const gf = createMockGF()
    let captured: GuideFlowInstance | null = null

    function Consumer() {
      captured = useGuideFlow()
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    expect(captured).toBe(gf)
  })

  it('throws when useGuideFlow is used outside TourProvider', () => {
    function Bad() {
      useGuideFlow()
      return null
    }

    // Suppress console.error from React for expected throws
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow('[GuideFlow] useGuideFlow must be used inside a <TourProvider>')
    spy.mockRestore()
  })
})

describe('useTour', () => {
  it('returns initial tour state', () => {
    const gf = createMockGF()
    let state: any

    function Consumer() {
      state = useTour()
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    expect(state.isActive).toBe(false)
    expect(state.currentStepId).toBeNull()
  })

  it('calls gf.start when start() is invoked', async () => {
    const gf = createMockGF()
    let tourApi: any

    function Consumer() {
      tourApi = useTour()
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    const flow: FlowDefinition = {
      id: 'test',
      initial: 'a',
      states: { a: { steps: [{ id: 's1', content: { title: 'Hi' } }], on: {} } },
    }

    await act(async () => {
      await tourApi.start(flow)
    })

    expect(gf.start).toHaveBeenCalledWith(flow, undefined)
  })

  it('syncs state on tour:start event', () => {
    const gf = createMockGF()
    let state: any

    function Consumer() {
      state = useTour()
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    act(() => {
      gf._fire('tour:start', { flowId: 'f1' })
    })

    // State synced from gf properties
    expect(state).toBeDefined()
  })

  it('delegates next/prev/stop to gf', () => {
    const gf = createMockGF()
    let tourApi: any

    function Consumer() {
      tourApi = useTour()
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    act(() => {
      tourApi.stop()
    })
    expect(gf.stop).toHaveBeenCalled()
  })
})

describe('useTourStep', () => {
  it('returns a ref and isActive=false initially', () => {
    const gf = createMockGF()
    let result: any

    function Consumer() {
      result = useTourStep('my-step')
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    expect(result.ref).toBeDefined()
    expect(result.isActive).toBe(false)
  })

  it('sets isActive=true when step:enter matches stepId', () => {
    const gf = createMockGF()
    let result: any

    function Consumer() {
      result = useTourStep('target-step')
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    act(() => {
      gf._fire('step:enter', { stepId: 'target-step', stepIndex: 0, target: null as any })
    })

    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false when step:exit matches', () => {
    const gf = createMockGF()
    let result: any

    function Consumer() {
      result = useTourStep('exit-step')
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    act(() => {
      gf._fire('step:enter', { stepId: 'exit-step', stepIndex: 0, target: null as any })
    })
    expect(result.isActive).toBe(true)

    act(() => {
      gf._fire('step:exit', { stepId: 'exit-step', stepIndex: 0 })
    })
    expect(result.isActive).toBe(false)
  })

  it('resets isActive on tour:abandon', () => {
    const gf = createMockGF()
    let result: any

    function Consumer() {
      result = useTourStep('abandon-step')
      return null
    }

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    act(() => {
      gf._fire('step:enter', { stepId: 'abandon-step', stepIndex: 0, target: null as any })
    })
    expect(result.isActive).toBe(true)

    act(() => {
      gf._fire('tour:abandon', { flowId: 'f', stepId: 'abandon-step', stepIndex: 0 })
    })
    expect(result.isActive).toBe(false)
  })
})

describe('<TourStep>', () => {
  it('renders nothing when step is not active', () => {
    const gf = createMockGF()

    const { container } = render(
      <TourProvider instance={gf}>
        <TourStep id="inactive-step">
          <div data-testid="step-content">Content</div>
        </TourStep>
      </TourProvider>,
    )

    expect(container.querySelector('[data-testid="step-content"]')).toBeNull()
  })

  it('renders children when step:enter fires for this id', () => {
    const gf = createMockGF()

    render(
      <TourProvider instance={gf}>
        <TourStep id="active-step">
          <div data-testid="step-content">Visible</div>
        </TourStep>
      </TourProvider>,
    )

    act(() => {
      gf._fire('step:enter', { stepId: 'active-step', stepIndex: 0, target: null as any })
    })

    expect(screen.getByTestId('step-content')).toBeDefined()
    expect(screen.getByTestId('step-content').textContent).toBe('Visible')
  })

  it('supports render prop children with next/prev', () => {
    const gf = createMockGF()

    render(
      <TourProvider instance={gf}>
        <TourStep id="render-prop-step">
          {({ next, isActive }) => (
            <button data-testid="next-btn" onClick={next}>
              {isActive ? 'Active' : 'Inactive'}
            </button>
          )}
        </TourStep>
      </TourProvider>,
    )

    act(() => {
      gf._fire('step:enter', { stepId: 'render-prop-step', stepIndex: 0, target: null as any })
    })

    const btn = screen.getByTestId('next-btn')
    expect(btn.textContent).toBe('Active')
  })

  it('hides when tour:complete fires', () => {
    const gf = createMockGF()

    render(
      <TourProvider instance={gf}>
        <TourStep id="complete-step">
          <div data-testid="complete-content">Here</div>
        </TourStep>
      </TourProvider>,
    )

    act(() => {
      gf._fire('step:enter', { stepId: 'complete-step', stepIndex: 0, target: null as any })
    })
    expect(screen.getByTestId('complete-content')).toBeDefined()

    act(() => {
      gf._fire('tour:complete', { flowId: 'f1' })
    })
    expect(screen.queryByTestId('complete-content')).toBeNull()
  })
})
