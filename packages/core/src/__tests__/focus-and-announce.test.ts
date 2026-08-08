// ---------------------------------------------------------------------------
// Phase 8.1c — the three defects the 8.1 a11y review found and 8.1b left open.
//
// Two of the three ARE reachable here. The restore rule reads `activeElement`
// and calls `focus()` on real elements, and the completion announcement is
// `textContent` on a div — neither goes through `_focusables`, which is the
// thing happy-dom cannot do (`offsetParent` is null for everything, so it
// always returns an empty array).
//
// The third — "do not steal focus on every render" — depends on `_focusables`
// returning something, so it lives in `apps/e2e` and only there.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import type { FlowDefinition } from '../types/index.js'

const flow: FlowDefinition = {
  id: 'end-flow',
  initial: 'm',
  states: {
    m: {
      steps: [
        { id: 'e1', content: { title: 'One' } },
        { id: 'e2', content: { title: 'Two' } },
      ],
      final: true,
    },
  },
}

let gf: GuideFlowInstance | null = null

const region = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[role="status"][aria-live="polite"]')

/** Two frames plus a tick — the region clears on one rAF and writes on the next. */
const settle = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  await new Promise((r) => setTimeout(r, 0))
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = '<button id="trigger">Start</button><input id="field" />'
})

afterEach(() => {
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
})

describe('focus restore on ending', () => {
  it('hands focus back to the trigger when the tour had it', async () => {
    const trigger = document.getElementById('trigger') as HTMLButtonElement
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)
    gf.stop()

    expect(document.activeElement).toBe(trigger)
  })

  it('leaves focus alone when the app moved it during the tour', async () => {
    // The case `advanceOn` made reachable: the last step highlights a control,
    // the user activates it, the app opens something and focuses it — and the
    // tour must not rip focus back to a button from before it started.
    const trigger = document.getElementById('trigger') as HTMLButtonElement
    const field = document.getElementById('field') as HTMLInputElement
    trigger.focus()

    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)

    field.focus()
    expect(document.activeElement).toBe(field)

    gf.stop()

    expect(document.activeElement).toBe(field)
  })

  it('does not throw when the trigger left the document', async () => {
    const trigger = document.getElementById('trigger') as HTMLButtonElement
    trigger.focus()

    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)
    trigger.remove()

    expect(() => { gf?.stop() }).not.toThrow()
  })
})

describe('completion is announced', () => {
  it('speaks on completion, and keeps the region alive long enough to be read', async () => {
    // It used to be silent twice over: `Locale` had no completion string, and
    // `hideStep` removed the region in the same tick, so a pending rAF write
    // landed in a detached node.
    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)
    await gf.next()
    await gf.next()          // past the last step — the completed path
    expect(gf.isActive).toBe(false)

    await settle()
    expect(region()?.textContent).toBe('Tour complete')
  })

  it('says nothing when the tour is abandoned', async () => {
    // Escape, Skip and a backdrop click are user actions the assistive
    // technology has already spoken to. Announcing there is noise.
    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)
    gf.skip()

    await settle()
    expect(region()).toBeNull()
  })

  it('says nothing on pause — hideStep runs there too', async () => {
    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)
    gf.pause()

    await settle()
    expect(region()).toBeNull()
  })

  it('uses the active locale', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.i18n.register('es', { tourComplete: 'Tour completado' })
    gf.i18n.use('es')
    await gf.start(flow)
    await gf.next()
    await gf.next()

    await settle()
    expect(region()?.textContent).toBe('Tour completado')
  })

  it('a second tour gets a fresh region rather than a stale one', async () => {
    gf = createGuideFlow({ injectStyles: false })
    await gf.start(flow)
    await gf.next()
    await gf.next()
    await settle()

    await gf.start({ ...flow, id: 'second' })
    await settle()

    // The completion message must not still be sitting there under the new
    // tour's first step.
    expect(region()?.textContent).not.toBe('Tour complete')
  })
})
