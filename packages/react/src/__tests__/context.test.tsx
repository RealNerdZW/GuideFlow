// ---------------------------------------------------------------------------
// <TourProvider> — instance ownership, cleanup and renderer selection
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance } from '@guideflow/core'
import { act, cleanup, render } from '@testing-library/react'
import React, { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TourProvider, useGuideFlow, useTourContext, useTourRenderer } from '../context.js'
import { resetWarnOnce } from '../internal/dev.js'
import { createHeadlessRenderer } from '../renderer/headless-renderer.js'

const flow: FlowDefinition = {
  id: 'provider-flow',
  initial: 'a',
  states: {
    a: { steps: [{ id: 's1', content: { title: 'One', body: 'First' } }], final: true },
  },
}

/** Records every instance the provider hands out, and counts destroy() calls. */
interface Probe {
  gf: GuideFlowInstance
  destroyed: number
}

function makeProbe(): { seen: Probe[]; Probe: () => null } {
  const seen: Probe[] = []
  function ProbeComponent(): null {
    const gf = useGuideFlow()
    if (!seen.some((entry) => entry.gf === gf)) {
      const record: Probe = { gf, destroyed: 0 }
      const original = gf.destroy.bind(gf)
      gf.destroy = (): void => {
        record.destroyed++
        original()
      }
      seen.push(record)
    }
    return null
  }
  return { seen, Probe: ProbeComponent }
}

beforeEach(() => {
  resetWarnOnce()
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('TourProvider — context', () => {
  it('provides the instance it creates', () => {
    let captured: GuideFlowInstance | null = null
    function Consumer(): null {
      captured = useGuideFlow()
      return null
    }

    render(<TourProvider><Consumer /></TourProvider>)

    expect(captured).not.toBeNull()
  })

  it('provides a caller-supplied instance unchanged', () => {
    const gf = createGuideFlow()
    let captured: GuideFlowInstance | null = null
    function Consumer(): null {
      captured = useGuideFlow()
      return null
    }

    render(<TourProvider instance={gf}><Consumer /></TourProvider>)

    expect(captured).toBe(gf)
    gf.destroy()
  })

  it('throws when useGuideFlow is used outside TourProvider', () => {
    function Bad(): null {
      useGuideFlow()
      return null
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Bad />)).toThrow('[GuideFlow] useGuideFlow must be used inside a <TourProvider>')
    spy.mockRestore()
  })
})

describe('TourProvider — lifecycle', () => {
  it('destroys the instance it created on unmount', () => {
    const { seen, Probe } = makeProbe()
    const view = render(<TourProvider><Probe /></TourProvider>)

    expect(seen).toHaveLength(1)
    expect(seen[0]?.destroyed).toBe(0)

    view.unmount()

    expect(seen[0]?.destroyed).toBe(1)
  })

  it('removes core\'s popover and its keyboard handler when unmounted mid-tour', async () => {
    const { seen, Probe } = makeProbe()
    const view = render(<TourProvider><Probe /></TourProvider>)
    const gf = seen[0]?.gf
    if (!gf) throw new Error('no instance')

    await act(async () => { await gf.start(flow) })
    expect(document.querySelector('.gf-popover')).not.toBeNull()

    view.unmount()

    // AUDIT `react-provider-never-destroys-instance`: the popover DOM and the
    // document-level keydown listener used to survive the provider.
    expect(document.querySelector('.gf-popover')).toBeNull()
    expect(gf.isActive).toBe(false)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    })
    expect(gf.isActive).toBe(false)
  })

  it('does NOT destroy an instance passed via the instance prop', () => {
    const gf = createGuideFlow()
    const destroy = vi.spyOn(gf, 'destroy')

    const view = render(<TourProvider instance={gf}><div /></TourProvider>)
    view.unmount()

    expect(destroy).not.toHaveBeenCalled()
    destroy.mockRestore()
    gf.destroy()
  })

  it('hands out a live instance under StrictMode double-mounting', async () => {
    const { seen, Probe } = makeProbe()
    render(<StrictMode><TourProvider><Probe /></TourProvider></StrictMode>)

    // StrictMode runs setup → cleanup → setup, so the first instance is
    // destroyed and replaced; the replacement must still be alive. If this
    // count is 1 the double-invocation did not happen and the test is vacuous.
    expect(seen.length).toBe(2)
    const last = seen[seen.length - 1]
    if (!last) throw new Error('no instance')
    expect(last.destroyed).toBe(0)
    seen.slice(0, -1).forEach((entry) => expect(entry.destroyed).toBe(1))

    await act(async () => { await last.gf.start(flow) })
    expect(last.gf.isActive).toBe(true)
    expect(document.querySelectorAll('.gf-popover')).toHaveLength(1)
  })
})

describe('TourProvider — renderer selection', () => {
  it('defaults to core: no headless renderer in context', () => {
    let renderer: unknown = 'unset'
    function Consumer(): null {
      renderer = useTourRenderer()
      return null
    }

    render(<TourProvider><Consumer /></TourProvider>)

    expect(renderer).toBeNull()
  })

  it('renderer="react" installs a headless renderer and core draws nothing', async () => {
    const { seen, Probe } = makeProbe()
    let renderer: unknown = null
    function Consumer(): null {
      renderer = useTourRenderer()
      return null
    }

    render(<TourProvider renderer="react"><Probe /><Consumer /></TourProvider>)
    const gf = seen[0]?.gf
    if (!gf) throw new Error('no instance')

    await act(async () => { await gf.start(flow) })

    expect(renderer).not.toBeNull()
    expect(document.querySelector('.gf-popover')).toBeNull()
  })

  it('accepts a renderer object the caller built themselves', () => {
    const headless = createHeadlessRenderer()
    const gf = createGuideFlow({ renderer: headless })
    let captured: unknown = null
    function Consumer(): null {
      captured = useTourContext().renderer
      return null
    }

    render(<TourProvider instance={gf} renderer={headless}><Consumer /></TourProvider>)

    expect(captured).toBe(headless)
    gf.destroy()
  })

  it('warns and falls back to core when renderer="react" is combined with an instance', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const gf = createGuideFlow()
    let renderer: unknown = 'unset'
    function Consumer(): null {
      renderer = useTourRenderer()
      return null
    }

    render(<TourProvider instance={gf} renderer="react"><Consumer /></TourProvider>)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('renderer="react"'))
    expect(renderer).toBeNull()
    gf.destroy()
  })

  it('warns when config.renderer and renderer="react" are both supplied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    render(
      <TourProvider config={{ renderer: createHeadlessRenderer() }} renderer="react">
        <div />
      </TourProvider>,
    )

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('config.renderer'))
  })
})
