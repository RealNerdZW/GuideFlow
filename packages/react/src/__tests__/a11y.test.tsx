// ---------------------------------------------------------------------------
// Phase 6 — accessibility of the React-rendered popover.
//
// Mirrors `packages/core/src/__tests__/a11y.test.ts`. The two popovers are
// separate implementations of the same contract, and Phase 5 found that they
// had already drifted — so anything asserted about one is asserted about the
// other here.
// ---------------------------------------------------------------------------

import type { FlowDefinition, GuideFlowInstance } from '@guideflow/core'
import { act, cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConversationalPanel } from '../components/ConversationalPanel.js'
import { GuidePopover } from '../components/GuidePopover.js'
import { TourProvider, useGuideFlow } from '../context.js'
import { resetWarnOnce } from '../internal/dev.js'

const twoStepFlow: FlowDefinition = {
  id: 'a11y-flow',
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

const untitledFlow: FlowDefinition = {
  id: 'a11y-untitled',
  initial: 'a',
  states: {
    a: { steps: [{ id: 'u1', content: { body: 'No title here' } }], final: true },
  },
}

let captured: GuideFlowInstance | null = null

function Capture(): null {
  captured = useGuideFlow()
  return null
}

function gf(): GuideFlowInstance {
  if (!captured) throw new Error('no instance captured')
  return captured
}

function mount(): void {
  render(
    <TourProvider renderer="react">
      <Capture />
      <GuidePopover />
    </TourProvider>,
  )
}

async function startTour(flow: FlowDefinition = twoStepFlow): Promise<void> {
  await act(async () => { await gf().start(flow) })
}

function dialog(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="dialog"]')
  if (!el) throw new Error('no dialog rendered')
  return el
}

beforeEach(() => {
  resetWarnOnce()
  captured = null
  localStorage.clear()
})

afterEach(() => {
  captured?.destroy()
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('a11y — dialog semantics', () => {
  it('names the dialog from its title', async () => {
    mount()
    await startTour()

    const labelledBy = dialog().getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Step one')
    expect(dialog().getAttribute('aria-label')).toBeNull()
  })

  it('falls back to a localised aria-label when a step has no title', async () => {
    mount()
    await startTour(untitledFlow)

    expect(dialog().getAttribute('aria-labelledby')).toBeNull()
    expect(dialog().getAttribute('aria-label')).toBe('Product tour')
  })

  it('announces the progressbar as a step count, not a percentage', async () => {
    mount()
    await startTour()

    const bar = document.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    expect(bar.getAttribute('aria-valuemin')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('2')
    expect(bar.getAttribute('aria-valuetext')).toBe('Step 1 of 2')
    expect(bar.getAttribute('aria-label')).toBe('Tour progress')
  })

  it('matches the locale the instance is switched to', async () => {
    mount()
    gf().i18n.register('fr', { dialogLabel: 'Visite guidée' })
    gf().i18n.use('fr')
    await startTour(untitledFlow)

    // The React popover reads `gf.i18n`, not the module singleton — the trap
    // that produced AUDIT `react-guidepopover-ignores-instance-i18n`.
    expect(dialog().getAttribute('aria-label')).toBe('Visite guidée')
  })
})

describe('a11y — live region', () => {
  it('announces the step outside the dialog', async () => {
    mount()
    await startTour()

    const region = document.querySelector('[aria-live="polite"]')!
    expect(region).not.toBeNull()
    expect(region.getAttribute('role')).toBe('status')
    expect(dialog().contains(region)).toBe(false)
    expect(region.textContent).toBe('Step one. The first thing. Step 1 of 2')
  })

  it('updates the announcement on the next step', async () => {
    mount()
    await startTour()
    await act(async () => { await gf().next() })

    const region = document.querySelector('[aria-live="polite"]')!
    expect(region.textContent).toBe('Step two. The last thing. Step 2 of 2')
  })

  it('is visually hidden without leaving the accessibility tree', async () => {
    mount()
    await startTour()

    const region = document.querySelector<HTMLElement>('[aria-live="polite"]')!
    expect(region.style.display).not.toBe('none')
    expect(region.style.visibility).not.toBe('hidden')
    expect(region.style.position).toBe('absolute')
  })
})

describe('a11y — focus management', () => {
  it('moves focus into the dialog', async () => {
    mount()
    await startTour()

    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('restores focus when the tour ends', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    mount()
    await startTour()
    expect(document.activeElement).not.toBe(trigger)

    act(() => { gf().stop() })
    expect(document.activeElement).toBe(trigger)
  })

  it('wraps Tab from the last control back to the first', async () => {
    mount()
    await startTour()

    const buttons = Array.from(dialog().querySelectorAll('button'))
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!
    last.focus()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first control back to the last', async () => {
    mount()
    await startTour()

    const buttons = Array.from(dialog().querySelectorAll('button'))
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!
    first.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
    })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })

  it('pulls focus back when the page steals it', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    mount()
    await startTour()
    outside.focus()

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', bubbles: true, cancelable: true,
    }))

    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('stops trapping once the tour ends', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    mount()
    await startTour()
    act(() => { gf().stop() })
    outside.focus()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})

describe('a11y — ConversationalPanel', () => {
  function mountPanel(props: Partial<React.ComponentProps<typeof ConversationalPanel>> = {}): {
    onClose: () => void
    rerender: (open: boolean) => void
  } {
    const onClose = vi.fn<[], void>()
    const view = render(
      <TourProvider>
        <Capture />
        <ConversationalPanel open onClose={onClose} {...props} />
      </TourProvider>,
    )
    return {
      onClose,
      rerender: (open: boolean) => {
        view.rerender(
          <TourProvider>
            <Capture />
            <ConversationalPanel open={open} onClose={onClose} {...props} />
          </TourProvider>,
        )
      },
    }
  }

  it('focuses the question field when it opens', () => {
    mountPanel()

    const input = document.querySelector('input')!
    expect(document.activeElement).toBe(input)
  })

  it('hands focus back when it closes', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { rerender } = mountPanel()
    expect(document.activeElement).not.toBe(trigger)

    act(() => { rerender(false) })
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape', () => {
    const { onClose } = mountPanel()


    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    act(() => { document.dispatchEvent(event) })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not trap Tab — the panel is non-modal', () => {
    // Deliberate: the user is meant to keep using the page beside the panel.
    // A trap here would strand them.
    mountPanel()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    act(() => { document.dispatchEvent(event) })

    expect(event.defaultPrevented).toBe(false)
  })

  it('names the dialog and its controls', () => {
    mountPanel({ title: 'Need help?' })

    const panel = document.querySelector('[role="dialog"]')!
    expect(panel.getAttribute('aria-label')).toBe('Need help?')
    expect(document.querySelector('input')?.getAttribute('aria-label')).toBe('Ask a question')
    expect(document.querySelector('[role="log"]')?.getAttribute('aria-live')).toBe('polite')
  })

  it('leaves the question field a visible focus ring', () => {
    // `outline: none` on the only text input in the panel left keyboard users
    // with no indication of where they were.
    mountPanel()

    const input = document.querySelector('input')!
    expect(input.style.outline).not.toBe('none')
  })
})
