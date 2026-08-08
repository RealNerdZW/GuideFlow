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
 * A custom FSM action.
 *
 * This used to need a cast: `StepAction['action']` was
 * `… | (string & object)`, and no string literal satisfies `string & object`,
 * so core's own "any custom event" escape hatch could not be expressed at all.
 * Core now uses `string & Record<never, never>` and the cast is gone.
 */
function customAction(label: string, action: string): StepAction {
  return { label, action }
}

beforeEach(() => {
  resetWarnOnce()
  captured = null
})

afterEach(() => {
  captured?.destroy()
  cleanup()
  document.body.innerHTML = ''
  // `innerHTML` does not clear inline styles, and the RTL test writes one.
  document.body.removeAttribute('style')
  vi.restoreAllMocks()
})

/** Dispatch a Tab at the document, where the focus trap listens. */
function tab(shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })
  document.dispatchEvent(event)
  return event
}

function dialogEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!el) throw new Error('no dialog rendered')
  return el
}

function popoverButtons(): HTMLButtonElement[] {
  return Array.from(dialogEl().querySelectorAll('button'))
}

/** An element with a stubbed rect — happy-dom has no layout engine. */
function makeRectElement(tag: string, id: string, top = 200): HTMLElement {
  const el = document.createElement(tag)
  el.id = id
  el.getBoundingClientRect = () => ({
    x: 100, y: top, left: 100, top, width: 200, height: 50,
    right: 300, bottom: top + 50, toJSON: () => ({}),
  }) as DOMRect
  document.body.appendChild(el)
  return el
}

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

  it('hands the render prop prev and skip as well as next', async () => {
    mount(
      <GuidePopover>
        {({ content, prev, skip }) => (
          <div>
            <span data-testid="title">{content.title}</span>
            <button data-testid="back" onClick={prev} type="button">back</button>
            <button data-testid="away" onClick={skip} type="button">away</button>
          </div>
        )}
      </GuidePopover>,
    )
    await startTour()
    const dismissed = vi.fn()
    gf().on('tour:dismiss', dismissed)

    await settle(() => { void gf().next() })
    expect(screen.getByTestId('title').textContent).toBe('Step two')

    await settle(() => { fireEvent.click(screen.getByTestId('back')) })
    expect(screen.getByTestId('title').textContent).toBe('Step one')

    await settle(() => { fireEvent.click(screen.getByTestId('away')) })
    expect(dismissed).toHaveBeenCalledTimes(1)
    expect(gf().isActive).toBe(false)
  })

  it('close ends the tour without completing it', async () => {
    mount(
      <GuidePopover>
        {({ close }) => <button data-testid="x" onClick={close} type="button">x</button>}
      </GuidePopover>,
    )
    await startTour()
    const completed = vi.fn()
    const abandoned = vi.fn()
    gf().on('tour:complete', completed)
    gf().on('tour:abandon', abandoned)

    await settle(() => { fireEvent.click(screen.getByTestId('x')) })

    // `close` maps to core's `end` action, i.e. stop() — the abandoned path.
    expect(abandoned).toHaveBeenCalledTimes(1)
    expect(completed).not.toHaveBeenCalled()
  })

  it('focuses the dialog itself when the custom content has no controls', async () => {
    mount(<GuidePopover>{() => <p>Nothing to click here</p>}</GuidePopover>)
    await startTour()

    // `(focusable ?? el).focus()` — a dialog nobody can focus is one a screen
    // reader user never lands in.
    expect(document.activeElement).toBe(dialogEl())

    // With nothing focusable anywhere in scope the trap must let Tab through
    // rather than swallowing it.
    const event = tab()
    expect(event.defaultPrevented).toBe(false)
  })

  it('accepts a plain node as children', async () => {
    mount(<GuidePopover><p data-testid="static">Static content</p></GuidePopover>)
    await startTour()

    expect(screen.getByTestId('static').textContent).toBe('Static content')
    expect(screen.queryByText('Skip tour')).toBeNull()
  })
})

// ── Props ───────────────────────────────────────────────────────────────────

describe('GuidePopover — width and className', () => {
  it('appends the className and applies the width', async () => {
    mount(<GuidePopover className="tenant-theme" width={480} />)
    await startTour()

    const dialog = dialogEl()
    expect(dialog.className).toBe('gf-popover tenant-theme')
    expect(dialog.style.width).toBe('480px')
  })

  it('defaults to gf-popover alone at 320px', async () => {
    mount(<GuidePopover />)
    await startTour()

    expect(dialogEl().className).toBe('gf-popover')
    expect(dialogEl().style.width).toBe('320px')
  })
})

// ── clickThrough (ADR-024) ──────────────────────────────────────────────────

describe('GuidePopover — clickThrough steps', () => {
  const saveFlow: FlowDefinition = {
    id: 'ct-save',
    initial: 'a',
    states: {
      a: {
        steps: [{
          id: 'c1',
          target: '#save',
          clickThrough: true,
          scrollIntoView: false,
          content: { title: 'Click Save' },
        }],
        final: true,
      },
    },
  }

  const modalFlow: FlowDefinition = {
    id: 'ct-modal',
    initial: 'a',
    states: {
      a: {
        steps: [{
          id: 'm1',
          target: '#save',
          scrollIntoView: false,
          content: { title: 'Look at Save' },
        }],
        final: true,
      },
    },
  }

  function makeSaveButton(): HTMLButtonElement {
    const button = document.createElement('button')
    button.id = 'save'
    button.textContent = 'Save'
    document.body.appendChild(button)
    return button
  }

  it('drops aria-modal, because the page provably is not inert', async () => {
    makeSaveButton()
    mount(<GuidePopover />)
    await act(async () => { await gf().start(saveFlow) })

    // ADR-004 cut a hole in the overlay, so claiming the rest of the page is
    // inert would confine a screen reader away from the control being pointed at.
    expect(dialogEl().getAttribute('aria-modal')).toBeNull()
  })

  it('keeps aria-modal on an ordinary step with the same target', async () => {
    makeSaveButton()
    mount(<GuidePopover />)
    await act(async () => { await gf().start(modalFlow) })

    expect(dialogEl().getAttribute('aria-modal')).toBe('true')
  })

  it('widens the tab order to include the highlighted element', async () => {
    const save = makeSaveButton()
    mount(<GuidePopover />)
    await act(async () => { await gf().start(saveFlow) })

    const buttons = popoverButtons()
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!

    last.focus()
    expect(tab().defaultPrevented).toBe(true)
    // The hole in the overlay and the hole in the tab order are the same hole.
    expect(document.activeElement).toBe(save)

    // Discontiguous scope: from the target, Tab must come back round to the
    // popover rather than walking on into the page.
    expect(tab().defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('walks backwards out of the highlighted element into the popover', async () => {
    const save = makeSaveButton()
    mount(<GuidePopover />)
    await act(async () => { await gf().start(saveFlow) })

    const buttons = popoverButtons()
    const last = buttons[buttons.length - 1]!
    save.focus()

    expect(tab(true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })

  it('exposes a focusable child of a target that is not focusable itself', async () => {
    const panel = document.createElement('div')
    panel.id = 'save'
    const inner = document.createElement('button')
    inner.id = 'inner'
    panel.appendChild(inner)
    document.body.appendChild(panel)

    mount(<GuidePopover />)
    await act(async () => { await gf().start(saveFlow) })

    const buttons = popoverButtons()
    buttons[buttons.length - 1]!.focus()
    tab()

    // Exactly one element beyond the popover, and the `<div>` itself is not it.
    expect(document.activeElement).toBe(inner)
  })

  it('keeps the popover-only trap when the target is a function', async () => {
    makeSaveButton()
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'ct-fn',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'f1',
              target: () => document.querySelector('#save'),
              clickThrough: true,
              scrollIntoView: false,
              content: { title: 'Click Save' },
            }],
            final: true,
          },
        },
      })
    })

    const buttons = popoverButtons()
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!
    last.focus()
    tab()

    // KNOWN GAP, not a design choice. The engine resolves a function target
    // (tour.ts `await step.target(context)`), but the renderer re-resolves the
    // raw step as string | Element only, so targetEl is null and the trap never
    // widens — leaving a clickThrough step keyboard-unreachable. Core's
    // DefaultRenderer has the identical shape, so this is parity, not drift.
    // Pinned here so the behaviour cannot change unnoticed; see the ADR-024
    // entry in CLAUDE.md. Fixing it means handing the renderer the element the
    // engine already resolved, which is a RendererContract change.
    expect(document.activeElement).toBe(first)
  })

  it('sends Shift+Tab from outside the dialog to the last control', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    mount(<GuidePopover />)
    await startTour()
    outside.focus()

    const event = tab(true)

    expect(event.defaultPrevented).toBe(true)
    const buttons = popoverButtons()
    expect(document.activeElement).toBe(buttons[buttons.length - 1])
  })
})

// ── Focus, ADR-025 ──────────────────────────────────────────────────────────

describe('GuidePopover — focus belongs to whoever has it', () => {
  it('does not steal focus from a field the user is typing in', async () => {
    mount(<><input data-testid="field" /><GuidePopover /></>)
    await startTour()
    expect(dialogEl().contains(document.activeElement)).toBe(true)

    const field = screen.getByTestId('field')
    field.focus()
    await settle(() => { void gf().next() })

    // Advancing while the user types used to send the next keystroke to the
    // header close button, which ends the tour. WCAG 3.2.2.
    expect(document.activeElement).toBe(field)
    expect(dialogEl().textContent).toContain('Step two')
  })

  it('does not restore focus the app moved away before the tour ended', async () => {
    mount(<><button data-testid="opener">Open</button><button data-testid="confirm">OK</button><GuidePopover /></>)
    const opener = screen.getByTestId('opener')
    opener.focus()
    await startTour()

    // The app opens its own dialog in response to the step's action.
    const confirm = screen.getByTestId('confirm')
    confirm.focus()
    await settle(() => { gf().stop() })

    // Yanking focus back to a control captured before the tour began is
    // WCAG 2.4.3 — the tour did not have focus, so it does not get to give it.
    expect(document.activeElement).toBe(confirm)
  })

  it('restores the control the tour opened from, not one focused mid-tour', async () => {
    mount(<><button data-testid="opener">Open</button><button data-testid="mid">Other</button><GuidePopover /></>)
    const opener = screen.getByTestId('opener')
    opener.focus()
    await startTour()

    screen.getByTestId('mid').focus()
    await settle(() => { void gf().next() })
    // Focus comes back to the tour before it ends.
    popoverButtons()[0]!.focus()

    await settle(() => { gf().stop() })

    // The restore target is captured once, when the tour opens.
    expect(document.activeElement).toBe(opener)
  })
})

// ── Media and target forms ──────────────────────────────────────────────────

describe('GuidePopover — media and target forms', () => {
  it('renders a video with controls', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'video',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'v1',
              content: { title: 'Watch' },
              media: { type: 'video', src: '/clip.mp4' },
            }],
            final: true,
          },
        },
      })
    })

    const video = document.querySelector<HTMLVideoElement>('video.gf-popover-media')
    expect(video?.getAttribute('src')).toBe('/clip.mp4')
    expect(video?.controls).toBe(true)
  })

  it('gives an image with no alt an empty alt, marking it decorative', async () => {
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'noalt',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'n1',
              content: { title: 'Look' },
              media: { type: 'image', src: '/shot.png' },
            }],
            final: true,
          },
        },
      })
    })

    // A missing alt would make a screen reader read the file name.
    expect(document.querySelector('img.gf-popover-media')?.getAttribute('alt')).toBe('')
  })

  it('positions against a target passed as an Element', async () => {
    const anchor = makeRectElement('div', 'element-anchor')
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'el-target',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'e1',
              target: anchor,
              placement: 'bottom',
              scrollIntoView: false,
              content: { title: 'Anchored' },
            }],
            final: true,
          },
        },
      })
    })

    expect(dialogEl().style.top).toBe('262px')
    expect(dialogEl().getAttribute('data-placement')).toBe('bottom')
  })

  it('centres a step whose target is a function', async () => {
    makeRectElement('div', 'fn-anchor')
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'fn-target',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'fn1',
              target: () => document.querySelector('#fn-anchor'),
              placement: 'bottom',
              scrollIntoView: false,
              content: { title: 'Anchored' },
            }],
            final: true,
          },
        },
      })
    })

    // Documented limitation: the component resolves string and Element targets
    // only, so a function target falls back to the centred placement.
    expect(dialogEl().getAttribute('data-placement')).toBe('center')
  })

  it('defaults an unplaced step to bottom', async () => {
    makeRectElement('div', 'plain-anchor')
    mount(<GuidePopover />)
    await act(async () => {
      await gf().start({
        id: 'unplaced',
        initial: 'a',
        states: {
          a: {
            steps: [{
              id: 'p1',
              target: '#plain-anchor',
              scrollIntoView: false,
              content: { title: 'Anchored' },
            }],
            final: true,
          },
        },
      })
    })

    expect(dialogEl().getAttribute('data-placement')).toBe('bottom')
    expect(dialogEl().style.top).toBe('262px')
  })

  it('mirrors a logical placement when the popover inherits direction: rtl', async () => {
    makeRectElement('div', 'rtl-anchor')
    const flow: FlowDefinition = {
      id: 'rtl',
      initial: 'a',
      states: {
        a: {
          steps: [{
            id: 'r1',
            target: '#rtl-anchor',
            placement: 'bottom-start',
            scrollIntoView: false,
            content: { title: 'Anchored' },
          }],
          final: true,
        },
      },
    }

    mount(<GuidePopover />)
    await act(async () => { await gf().start(flow) })
    // Anchor spans x 100..300; `-start` is its leading edge.
    expect(dialogEl().getAttribute('data-placement')).toBe('bottom-start')
    expect(dialogEl().style.left).toBe('100px')

    // The portal mounts into document.body, so `direction` reaches the popover
    // by inheritance exactly as it would in a real RTL app.
    document.body.style.direction = 'rtl'
    await settle(() => { window.dispatchEvent(new Event('resize')) })

    expect(dialogEl().getAttribute('data-placement')).toBe('bottom-end')
    expect(dialogEl().style.left).toBe('300px')
  })
})
