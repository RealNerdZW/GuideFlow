// ---------------------------------------------------------------------------
// <GuidePopover> — the React-rendered popover
//
// Every test here runs against a real createGuideFlow() instance, because the
// defect this component is being fixed for (two stacked dialogs) is only
// visible when the real engine and the real DefaultRenderer are in play.
// ---------------------------------------------------------------------------

import type { FlowDefinition, GuideFlowInstance, StepAction } from '@guideflow/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GuidePopover } from '../components/GuidePopover.js'
import { TourProvider, useGuideFlow } from '../context.js'
import { resetWarnOnce } from '../internal/dev.js'

const twoStepFlow: FlowDefinition = {
  id: 'popover-flow',
  initial: 'a',
  states: {
    a: {
      steps: [
        { id: 's1', content: { title: 'Step one', body: 'The first thing' } },
        { id: 's2', content: { title: 'Step two', body: 'The last thing' } },
      ],
      final: true,
    },
  },
}

let captured: GuideFlowInstance | null = null

function Capture(): null {
  captured = useGuideFlow()
  return null
}

function mount(ui: React.ReactNode, mode: 'core' | 'react' = 'react'): ReturnType<typeof render> {
  return render(
    <TourProvider renderer={mode}>
      <Capture />
      {ui}
    </TourProvider>,
  )
}

function gf(): GuideFlowInstance {
  if (!captured) throw new Error('no instance captured')
  return captured
}

async function startTour(flow: FlowDefinition = twoStepFlow): Promise<void> {
  await act(async () => { await gf().start(flow) })
}

/** Run a synchronous interaction, then let the engine's async render settle. */
async function settle(fn: () => void): Promise<void> {
  await act(async () => {
    fn()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/**
 * A custom FSM action. `StepAction['action']` is typed
 * `'next' | 'prev' | 'skip' | 'end' | (string & object)`, and no string literal
 * satisfies `string & object` — so core's own "any custom event" escape hatch
 * cannot be expressed in TypeScript today. Cast until core changes it to
 * `string & {}`.
 */
function customAction(label: string, action: string): StepAction {
  return { label, action } as unknown as StepAction
}

beforeEach(() => {
  resetWarnOnce()
  captured = null
})

afterEach(() => {
  captured?.destroy()
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// ── The headline defect ─────────────────────────────────────────────────────

describe('GuidePopover — one popover, never two', () => {
  it('renders nothing in renderer="core" mode, leaving core\'s single dialog', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mount(<GuidePopover />, 'core')
    await startTour()

    // AUDIT `react-guidepopover-duplicates-core-renderer`: this used to be 2.
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1)
    // The one that survived is core's, built by DefaultRenderer.
    expect(document.querySelector('[role="dialog"]')?.id).toMatch(/^gf-popover/)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('renders nothing'))
  })

  it('warns only once, however many times it is mounted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mount(<><GuidePopover /><GuidePopover /></>, 'core')
    await startTour()

    const noOpWarnings = warn.mock.calls.filter(([msg]) => String(msg).includes('renders nothing'))
    expect(noOpWarnings).toHaveLength(1)
  })

  it('is the only dialog in renderer="react" mode', async () => {
    mount(<GuidePopover />)
    await startTour()

    const dialogs = document.querySelectorAll('[role="dialog"]')
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]?.textContent).toContain('Step one')
    // core's DefaultRenderer never ran, so no element carries its generated id.
    expect(document.querySelector('[id^="gf-popover"]')).toBeNull()
  })

  it('renders nothing until a step is active', () => {
    mount(<GuidePopover />)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

// ── Default layout ──────────────────────────────────────────────────────────

describe('GuidePopover — default layout', () => {
  it('renders the title, body, progress and step counter', async () => {
    mount(<GuidePopover />)
    await startTour()

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Step one')
    expect(screen.getByText('The first thing')).toBeTruthy()
    expect(screen.getByText('Step 1 of 2')).toBeTruthy()
  })

  it('omits the progress bar and counter for a single-step state', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'solo',
        initial: 'a',
        states: { a: { steps: [{ id: 'only', content: { title: 'Alone' } }], final: true } },
      })
    })

    expect(document.querySelector('.gf-progress-bar')).toBeNull()
    expect(screen.queryByText(/Step \d of/)).toBeNull()
  })

  it('shows a progress bar and "Step n of m" for multi-step states', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'multi',
        initial: 'a',
        states: {
          a: {
            steps: [
              { id: 'm1', content: { title: 'One' } },
              { id: 'm2', content: { title: 'Two' } },
            ],
            final: true,
          },
        },
      })
    })

    // A step number, not a percentage — "50 percent" is not something a screen
    // reader can turn into "where am I". See a11y.test.tsx for the rest.
    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('2')
    expect(bar.getAttribute('aria-valuetext')).toBe('Step 1 of 2')
    expect(screen.getByText('Step 1 of 2')).toBeTruthy()
  })

  it('advances with the Next button and shows Back from the second step', async () => {
    mount(<GuidePopover />)
    await startTour()

    expect(screen.queryByText('Back')).toBeNull()
    await settle(() => { fireEvent.click(screen.getByText('Next')) })

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Step two')
    expect(screen.getByText('Back')).toBeTruthy()
  })

  it('completes the tour from the last step — Done fires tour:complete, not tour:abandon', async () => {
    mount(<GuidePopover />)
    const completed = vi.fn()
    const abandoned = vi.fn()

    await startTour()
    gf().on('tour:complete', completed)
    gf().on('tour:abandon', abandoned)

    await settle(() => { fireEvent.click(screen.getByText('Next')) })
    expect(screen.getByText('Done')).toBeTruthy()
    await settle(() => { fireEvent.click(screen.getByText('Done')) })

    expect(completed).toHaveBeenCalledTimes(1)
    expect(abandoned).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('dismisses through the Skip button', async () => {
    mount(<GuidePopover />)
    const dismissed = vi.fn()
    await startTour()
    gf().on('tour:dismiss', dismissed)

    await settle(() => { fireEvent.click(screen.getByText('Skip tour')) })

    expect(dismissed).toHaveBeenCalledTimes(1)
    expect(gf().isActive).toBe(false)
  })

  it('closes through the × button', async () => {
    mount(<GuidePopover />)
    await startTour()

    await settle(() => { fireEvent.click(screen.getByLabelText('Close')) })

    expect(gf().isActive).toBe(false)
  })
})

// ── Step features core's renderer honours (or should) ───────────────────────

describe('GuidePopover — step.actions, content.html and step.media', () => {
  it('renders step.actions instead of the default buttons and dispatches FSM events', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'actions',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'a1',
              content: { title: 'Pick one' },
              actions: [customAction('Take me there', 'GO')],
            }],
            on: { GO: 'b' },
          },
          b: { steps: [{ id: 'b1', content: { title: 'Arrived' } }], final: true },
        },
      })
    })

    // AUDIT `react-guidepopover-drops-actions-html-media`: the footer used to be
    // hard-coded, making the GO branch unreachable.
    expect(screen.queryByText('Next')).toBeNull()
    await settle(() => { fireEvent.click(screen.getByText('Take me there')) })

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Arrived')
  })

  it('renders content.html as plain text and never as markup', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'html',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'h1',
              content: { title: 'Rich', html: '<b>bold</b><script>alert(1)</script>' },
            }],
            final: true,
          },
        },
      })
    })

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('bold')
    expect(dialog?.querySelector('b')).toBeNull()
    expect(dialog?.querySelector('script')).toBeNull()
  })

  it('renders step.media', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'media',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'm1',
              content: { title: 'Look' },
              media: { type: 'image', src: '/shot.png', alt: 'A screenshot' },
            }],
            final: true,
          },
        },
      })
    })

    const img = screen.getByAltText('A screenshot')
    expect(img.getAttribute('src')).toBe('/shot.png')
  })
})

// ── i18n ────────────────────────────────────────────────────────────────────

describe('GuidePopover — i18n', () => {
  it('uses the instance registry, not the module singleton', async () => {
    mount(<GuidePopover />)
    gf().i18n.register('fr', { next: 'Suivant', prev: 'Retour', skip: 'Passer', done: 'Terminé', close: 'Fermer' })
    gf().i18n.use('fr')

    await startTour()

    // AUDIT `react-guidepopover-ignores-instance-i18n`.
    expect(screen.getByText('Suivant')).toBeTruthy()
    expect(screen.getByText('Passer')).toBeTruthy()
    expect(screen.getByLabelText('Fermer')).toBeTruthy()
  })
})

// ── Lifecycle ───────────────────────────────────────────────────────────────

describe('GuidePopover — lifecycle', () => {
  it('disappears while the tour is paused and returns on resume', async () => {
    mount(<GuidePopover />)
    await startTour()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    // AUDIT `react-guidepopover-stays-visible-after-pause`.
    await settle(() => { gf().pause() })
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    await settle(() => { gf().resume() })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('disappears when the tour is stopped', async () => {
    mount(<GuidePopover />)
    await startTour()

    await settle(() => { gf().stop() })

    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})

// ── Focus ───────────────────────────────────────────────────────────────────

describe('GuidePopover — focus', () => {
  it('moves focus into the dialog and restores it when the tour ends', async () => {
    mount(<><button data-testid="opener">Open</button><GuidePopover /></>)
    const opener = screen.getByTestId('opener')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    await startTour()

    // AUDIT `react-popover-never-focuses`.
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.contains(document.activeElement)).toBe(true)

    await settle(() => { gf().stop() })
    expect(document.activeElement).toBe(opener)
  })
})

// ── Positioning ─────────────────────────────────────────────────────────────

describe('GuidePopover — positioning', () => {
  function targetFlow(): FlowDefinition {
    return {
      id: 'positioned',
      initial: 'a',
      states: {
        a: {
          steps: [{
            id: 'p1',
            target: '#anchor',
            placement: 'bottom',
            scrollIntoView: false,
            content: { title: 'Anchored' },
          }],
          final: true,
        },
      },
    }
  }

  function makeAnchor(top: number): HTMLElement {
    const anchor = document.createElement('div')
    anchor.id = 'anchor'
    anchor.getBoundingClientRect = () => ({
      x: 100, y: top, left: 100, top, width: 200, height: 50,
      right: 300, bottom: top + 50, toJSON: () => ({}),
    }) as DOMRect
    document.body.appendChild(anchor)
    return anchor
  }

  it('is positioned against its target before the first paint', async () => {
    const anchor = makeAnchor(200)
    mount(<GuidePopover />)
    await act(async () => { await gf().start(targetFlow()) })

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    // bottom placement: y = top + height + 12
    expect(dialog?.style.top).toBe('262px')
    expect(dialog?.style.left).toBe('200px')
    // AUDIT `react-guidepopover-position-flash-and-no-scroll-tracking`: never
    // visible at the origin.
    expect(dialog?.style.visibility).toBe('visible')
    anchor.remove()
  })

  it('follows the target on scroll', async () => {
    const anchor = makeAnchor(200)
    mount(<GuidePopover />)
    await act(async () => { await gf().start(targetFlow()) })

    anchor.getBoundingClientRect = () => ({
      x: 100, y: 400, left: 100, top: 400, width: 200, height: 50,
      right: 300, bottom: 450, toJSON: () => ({}),
    }) as DOMRect

    await settle(() => { window.dispatchEvent(new Event('scroll')) })

    expect(document.querySelector<HTMLElement>('[role="dialog"]')?.style.top).toBe('462px')
    anchor.remove()
  })

  it('centres itself when the step has no target', async () => {
    mount(<GuidePopover />)
    await startTour()

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute('data-placement')).toBe('center')
  })
})

// ── Custom content ──────────────────────────────────────────────────────────

describe('GuidePopover — custom children', () => {
  it('replaces the default layout and receives navigation callbacks', async () => {
    mount(
      <GuidePopover>
        {({ content, index, total, next }) => (
          <button data-testid="custom" onClick={next}>
            {content.title} — {index + 1}/{total}
          </button>
        )}
      </GuidePopover>,
    )
    await startTour()

    const button = screen.getByTestId('custom')
    expect(button.textContent).toBe('Step one — 1/2')
    expect(screen.queryByText('Skip tour')).toBeNull()

    await settle(() => { fireEvent.click(button) })
    expect(screen.getByTestId('custom').textContent).toBe('Step two — 2/2')
  })
})
