// ---------------------------------------------------------------------------
// Hooks and small components, driven by a real createGuideFlow() instance.
//
// These used to run against a hand-written mock, which is how they kept passing
// while the components they cover were broken — AUDIT
// `react-tests-mock-only-half-the-surface-untested`.
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance } from '@guideflow/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React, { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HotspotBeacon } from '../components/HotspotBeacon.js'
import { TourStep } from '../components/TourStep.js'
import { TourProvider } from '../context.js'
import { useHotspot, useTourStep } from '../hooks/use-tour-step.js'
import { useTour, type UseTourReturn } from '../hooks/use-tour.js'

const flow: FlowDefinition = {
  id: 'hooks-flow',
  initial: 'a',
  states: {
    a: {
      steps: [
        { id: 's1', content: { title: 'One' } },
        { id: 's2', content: { title: 'Two' } },
      ],
      on: { JUMP: 'b' },
      final: false,
    },
    b: {
      steps: [{ id: 's3', content: { title: 'Three' } }],
      final: true,
    },
  },
}

let gf: GuideFlowInstance

beforeEach(() => {
  gf = createGuideFlow()
})

afterEach(() => {
  cleanup()
  gf.destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function wrap(ui: React.ReactNode): ReturnType<typeof render> {
  return render(<TourProvider instance={gf}>{ui}</TourProvider>)
}

/** Run a synchronous engine call, then let its async render settle. */
async function settle(fn: () => void): Promise<void> {
  await act(async () => {
    fn()
    await Promise.resolve()
    await Promise.resolve()
  })
}

// ── useTour ─────────────────────────────────────────────────────────────────

describe('useTour', () => {
  let api: UseTourReturn

  function Consumer(): null {
    api = useTour()
    return null
  }

  it('reports an idle tour before anything starts', () => {
    wrap(<Consumer />)

    expect(api.isActive).toBe(false)
    expect(api.isPaused).toBe(false)
    expect(api.currentStepId).toBeNull()
    expect(api.totalSteps).toBe(0)
  })

  it('tracks the tour as it runs', async () => {
    wrap(<Consumer />)

    await act(async () => { await api.start(flow) })
    expect(api.isActive).toBe(true)
    expect(api.currentStepId).toBe('s1')
    expect(api.currentStepIndex).toBe(0)
    expect(api.totalSteps).toBe(2)

    await act(async () => { await api.next() })
    expect(api.currentStepId).toBe('s2')
    expect(api.currentStepIndex).toBe(1)

    await act(async () => { await api.prev() })
    expect(api.currentStepId).toBe('s1')
  })

  it('jumps with goTo and crosses states with send', async () => {
    wrap(<Consumer />)
    await act(async () => { await api.start(flow) })

    await act(async () => { await api.goTo('s2') })
    expect(api.currentStepId).toBe('s2')

    await act(async () => { await api.send('JUMP') })
    expect(api.currentStepId).toBe('s3')
  })

  it('stops the tour', async () => {
    wrap(<Consumer />)
    await act(async () => { await api.start(flow) })

    act(() => { api.stop() })
    expect(api.isActive).toBe(false)
    expect(api.currentStepId).toBeNull()
  })

  it('exposes pause/resume and reports isPaused', async () => {
    wrap(<Consumer />)
    await act(async () => { await api.start(flow) })

    act(() => { api.pause() })
    expect(api.isPaused).toBe(true)
    expect(api.isActive).toBe(true)

    await settle(() => { api.resume() })
    expect(api.isPaused).toBe(false)
    expect(api.currentStepId).toBe('s1')
  })

  it('exposes skip, which dismisses the tour', async () => {
    wrap(<Consumer />)
    const dismissed = vi.fn()
    await act(async () => { await api.start(flow) })
    gf.on('tour:dismiss', dismissed)

    act(() => { api.skip() })

    expect(dismissed).toHaveBeenCalledTimes(1)
    expect(api.isActive).toBe(false)
  })

  it('warns when start() has no flow and no default flowId', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    wrap(<Consumer />)

    await act(async () => { await api.start() })

    expect(warn).toHaveBeenCalledWith('[GuideFlow] useTour: no flow provided to start()')
    expect(api.isActive).toBe(false)
  })

  it('starts the flowId passed to the hook when start() gets no argument', async () => {
    function Defaulted(): null {
      api = useTour('hooks-flow')
      return null
    }
    gf.createFlow(flow)
    wrap(<Defaulted />)

    await act(async () => { await api.start() })

    expect(api.currentStepId).toBe('s1')
  })

  it('keeps two consumers in agreement (no tearing between subscribers)', async () => {
    const seen: Array<[string | null, string | null]> = []
    function Pair(): React.JSX.Element {
      const a = useTour()
      const b = useTour()
      seen.push([a.currentStepId, b.currentStepId])
      return <span data-testid="ids">{a.currentStepId}/{b.currentStepId}</span>
    }
    wrap(<Pair />)

    await act(async () => { await gf.start(flow) })
    await act(async () => { await gf.next() })

    expect(screen.getByTestId('ids').textContent).toBe('s2/s2')
    seen.forEach(([a, b]) => expect(a).toBe(b))
  })

  it('stops listening once the last consumer unmounts', async () => {
    const view = wrap(<Consumer />)
    await act(async () => { await gf.start(flow) })
    view.unmount()

    // No "update on an unmounted component" warning, and no throw.
    await act(async () => { await gf.next() })
    expect(gf.currentStepId).toBe('s2')
  })
})

// ── useTourStep ─────────────────────────────────────────────────────────────

describe('useTourStep', () => {
  function Watcher({ id }: { id: string }): React.JSX.Element {
    const { ref, isActive } = useTourStep<HTMLDivElement>(id)
    return <div ref={ref} data-testid={id}>{isActive ? 'active' : 'idle'}</div>
  }

  it('is active only for the step on screen', async () => {
    wrap(<><Watcher id="s1" /><Watcher id="s2" /></>)

    expect(screen.getByTestId('s1').textContent).toBe('idle')

    await act(async () => { await gf.start(flow) })
    expect(screen.getByTestId('s1').textContent).toBe('active')
    expect(screen.getByTestId('s2').textContent).toBe('idle')

    await act(async () => { await gf.next() })
    expect(screen.getByTestId('s1').textContent).toBe('idle')
    expect(screen.getByTestId('s2').textContent).toBe('active')
  })

  it('reports inactive while the tour is paused', async () => {
    wrap(<Watcher id="s1" />)
    await act(async () => { await gf.start(flow) })

    act(() => { gf.pause() })
    expect(screen.getByTestId('s1').textContent).toBe('idle')

    await settle(() => { gf.resume() })
    expect(screen.getByTestId('s1').textContent).toBe('active')
  })

  it('resets when the tour ends', async () => {
    wrap(<Watcher id="s1" />)
    await act(async () => { await gf.start(flow) })

    act(() => { gf.stop() })
    expect(screen.getByTestId('s1').textContent).toBe('idle')
  })

  it('hands back a ref that is attached to the caller\'s element', () => {
    const holder: { ref: React.RefObject<HTMLDivElement> | null } = { ref: null }
    function Probe(): React.JSX.Element {
      const { ref } = useTourStep<HTMLDivElement>('s1')
      holder.ref = ref
      return <div ref={ref} data-testid="probe" />
    }
    wrap(<Probe />)

    expect(holder.ref?.current).toBe(screen.getByTestId('probe'))
  })
})

// ── useHotspot ──────────────────────────────────────────────────────────────

describe('useHotspot', () => {
  function Beacon(): React.JSX.Element {
    const ref = useRef<HTMLButtonElement>(null)
    const { id } = useHotspot(ref, { title: 'Hi', body: 'There' })
    return <button ref={ref} data-testid="host">{id ?? 'no-id'}</button>
  }

  it('returns the registered hotspot id to the caller', () => {
    wrap(<Beacon />)

    // AUDIT `react-usehotspot-returns-null-id`: this used to render "no-id"
    // forever, because the id lived in a ref written during an effect.
    expect(screen.getByTestId('host').textContent).not.toBe('no-id')
    expect(screen.getByTestId('host').textContent).toMatch(/.+/)
  })

  it('removes the hotspot when the component unmounts', () => {
    const remove = vi.spyOn(gf, 'removeHotspot')
    const view = wrap(<Beacon />)
    const id = screen.getByTestId('host').textContent

    view.unmount()

    expect(remove).toHaveBeenCalledWith(id)
  })

  it('does nothing when the ref is empty', () => {
    function Empty(): React.JSX.Element {
      const ref = useRef<HTMLButtonElement>(null)
      const { id } = useHotspot(ref, { title: 'Hi' })
      return <span data-testid="empty">{id ?? 'no-id'}</span>
    }
    const hotspot = vi.spyOn(gf, 'hotspot')
    wrap(<Empty />)

    expect(hotspot).not.toHaveBeenCalled()
    expect(screen.getByTestId('empty').textContent).toBe('no-id')
  })
})

// ── <HotspotBeacon> ─────────────────────────────────────────────────────────

describe('<HotspotBeacon>', () => {
  it('registers a hotspot for its selector and removes it on unmount', () => {
    const anchor = document.createElement('div')
    anchor.id = 'beacon-target'
    document.body.appendChild(anchor)

    const hotspot = vi.spyOn(gf, 'hotspot')
    const remove = vi.spyOn(gf, 'removeHotspot')

    const view = wrap(<HotspotBeacon target="#beacon-target" title="Look" />)
    expect(hotspot).toHaveBeenCalledWith('#beacon-target', { title: 'Look' })

    view.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
    anchor.remove()
  })
})

// ── <TourStep> ──────────────────────────────────────────────────────────────

describe('<TourStep>', () => {
  it('renders nothing while its step is inactive', () => {
    wrap(<TourStep id="s1"><div data-testid="content">Here</div></TourStep>)
    expect(screen.queryByTestId('content')).toBeNull()
  })

  it('renders children while its step is on screen', async () => {
    wrap(<TourStep id="s1"><div data-testid="content">Here</div></TourStep>)

    await act(async () => { await gf.start(flow) })
    expect(screen.getByTestId('content')).toBeTruthy()

    await act(async () => { await gf.next() })
    expect(screen.queryByTestId('content')).toBeNull()
  })

  it('supports a render prop with next/prev', async () => {
    wrap(
      <>
        <TourStep id="s1">
          {({ next, isActive }) => (
            <button data-testid="btn" onClick={next}>{isActive ? 'Active' : 'Inactive'}</button>
          )}
        </TourStep>
        <TourStep id="s2">
          {({ prev }) => <button data-testid="back" onClick={prev}>Back</button>}
        </TourStep>
      </>,
    )
    await act(async () => { await gf.start(flow) })

    expect(screen.getByTestId('btn').textContent).toBe('Active')
    await settle(() => { fireEvent.click(screen.getByTestId('btn')) })
    expect(gf.currentStepId).toBe('s2')

    await settle(() => { fireEvent.click(screen.getByTestId('back')) })
    expect(gf.currentStepId).toBe('s1')
  })

  it('hides while the tour is paused', async () => {
    wrap(<TourStep id="s1"><div data-testid="content">Here</div></TourStep>)
    await act(async () => { await gf.start(flow) })

    act(() => { gf.pause() })
    expect(screen.queryByTestId('content')).toBeNull()

    await settle(() => { gf.resume() })
    expect(screen.getByTestId('content')).toBeTruthy()
  })

  it('hides when the tour completes', async () => {
    wrap(<TourStep id="s1"><div data-testid="content">Here</div></TourStep>)
    await act(async () => { await gf.start(flow) })

    act(() => { gf.stop() })
    expect(screen.queryByTestId('content')).toBeNull()
  })
})
