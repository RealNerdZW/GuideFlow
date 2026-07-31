// ---------------------------------------------------------------------------
// Phase 6 — accessibility
//
// Pins the behaviour the audit found missing: a focus trap and focus
// restoration around the dialog, a live region that actually announces steps,
// a progressbar that announces a step count rather than a percentage, and a
// keyboard handler that stops stealing keystrokes aimed at form controls.
//
// happy-dom has no layout engine, so `offsetParent` is null for everything.
// The renderer's `_focusables()` filter allows `document.activeElement` through
// for exactly that reason, but a fresh popover has focus nowhere yet — so the
// tests that need real tab order stub `offsetParent`. That stub is the test
// standing in for a browser, not a workaround for a product bug; the same paths
// are covered for real in `apps/e2e/tests/a11y.spec.ts`.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

import { HotspotManager } from '../engine/hotspot.js'
import { createGuideFlow } from '../index.js'
import { DefaultRenderer } from '../renderer/default-renderer.js'
import type { Step, StepContent, GuideFlowConfig, FlowDefinition } from '../types/index.js'

/** Make every element in the popover count as visible for tab-order purposes. */
function makeVisible(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? document.body : null
    },
  })
  return () => {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'offsetParent', descriptor)
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)['offsetParent']
  }
}

function render(renderer: DefaultRenderer, content: StepContent, index = 0, total = 3): void {
  const step: Step = { id: `step-${index}`, content }
  renderer.renderStep(step, content, index, total)
}

describe('a11y — DefaultRenderer dialog semantics', () => {
  let renderer: DefaultRenderer

  beforeEach(() => {
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)
  })

  afterEach(() => {
    renderer.hideStep()
    document.body.innerHTML = ''
  })

  it('names the dialog from its title when there is one', () => {
    render(renderer, { title: 'Welcome', body: 'Body' })

    const popover = document.querySelector('.gf-popover')!
    const labelledBy = popover.getAttribute('aria-labelledby')
    expect(labelledBy).not.toBeNull()
    expect(document.getElementById(labelledBy!)?.textContent).toBe('Welcome')
    // Both would be a contradiction; aria-labelledby wins and aria-label is
    // then dead weight that some tools report as an error.
    expect(popover.getAttribute('aria-label')).toBeNull()
  })

  it('falls back to a localised aria-label when a step has no title', () => {
    render(renderer, { body: 'Body only' })

    const popover = document.querySelector('.gf-popover')!
    // The bug: `aria-labelledby` pointed at a `-title` element the renderer had
    // not emitted, leaving the dialog with no accessible name at all.
    expect(popover.getAttribute('aria-labelledby')).toBeNull()
    expect(popover.getAttribute('aria-label')).toBe('Product tour')
  })

  it('drops aria-describedby when a step has no body', () => {
    render(renderer, { title: 'Title only' })

    const popover = document.querySelector('.gf-popover')!
    expect(popover.getAttribute('aria-describedby')).toBeNull()
  })

  it('re-points aria-* when the next step has a different shape', () => {
    render(renderer, { title: 'Has title', body: 'Has body' }, 0)
    render(renderer, { body: 'Body only' }, 1)

    const popover = document.querySelector('.gf-popover')!
    // Attributes are set on a reused element, so a stale one survives unless
    // the renderer explicitly removes it.
    expect(popover.getAttribute('aria-labelledby')).toBeNull()
    expect(popover.getAttribute('aria-label')).toBe('Product tour')
  })

  it('announces the progressbar as a step count, not a percentage', () => {
    render(renderer, { title: 'Step 2', body: 'b' }, 1, 4)

    const bar = document.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('2')
    expect(bar.getAttribute('aria-valuemin')).toBe('1')
    expect(bar.getAttribute('aria-valuemax')).toBe('4')
    expect(bar.getAttribute('aria-valuetext')).toBe('Step 2 of 4')
    expect(bar.getAttribute('aria-label')).toBe('Tour progress')
  })

  it('omits the progressbar entirely for a single-step tour', () => {
    render(renderer, { title: 'Only', body: 'b' }, 0, 1)
    expect(document.querySelector('[role="progressbar"]')).toBeNull()
  })
})

describe('a11y — live region', () => {
  let renderer: DefaultRenderer
  let restoreRaf: (() => void) | undefined

  beforeEach(() => {
    // The announcement is written on the next frame, after a clearing pass.
    // Run the callback synchronously so the test does not have to wait.
    const original = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      cb(0)
      return 0
    }) as typeof globalThis.requestAnimationFrame
    restoreRaf = () => { globalThis.requestAnimationFrame = original }

    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)
  })

  afterEach(() => {
    renderer.hideStep()
    restoreRaf?.()
    document.body.innerHTML = ''
  })

  it('announces the step through a polite live region', () => {
    render(renderer, { title: 'Filters', body: 'Narrow the list' }, 1, 3)

    const region = document.querySelector('[aria-live="polite"]')!
    expect(region).not.toBeNull()
    expect(region.getAttribute('role')).toBe('status')
    expect(region.getAttribute('aria-atomic')).toBe('true')
    expect(region.textContent).toBe('Filters. Narrow the list. Step 2 of 3')
  })

  it('keeps the live region out of the popover so it survives a re-render', () => {
    render(renderer, { title: 'One', body: 'a' }, 0, 2)
    const region = document.querySelector('[aria-live="polite"]')!
    const popover = document.querySelector('.gf-popover')!

    expect(popover.contains(region)).toBe(false)

    render(renderer, { title: 'Two', body: 'b' }, 1, 2)
    // Same node, new text — a screen reader reads the change.
    expect(document.querySelector('[aria-live="polite"]')).toBe(region)
    expect(region.textContent).toBe('Two. b. Step 2 of 2')
  })

  it('is visually hidden without leaving the accessibility tree', () => {
    render(renderer, { title: 'x', body: 'y' })

    const region = document.querySelector<HTMLElement>('[aria-live="polite"]')!
    // display:none / visibility:hidden would remove it from the a11y tree, and
    // nothing would ever be announced.
    expect(region.style.display).not.toBe('none')
    expect(region.style.visibility).not.toBe('hidden')
    expect(region.style.position).toBe('absolute')
    expect(region.style.width).toBe('1px')
  })

  it('removes the live region when the tour ends', () => {
    render(renderer, { title: 'x', body: 'y' })
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()

    renderer.hideStep()
    expect(document.querySelector('[aria-live="polite"]')).toBeNull()
  })
})

describe('a11y — focus management', () => {
  let renderer: DefaultRenderer
  let undoVisible: () => void

  beforeEach(() => {
    undoVisible = makeVisible()
    renderer = new DefaultRenderer()
    renderer.onInit({ injectStyles: false } as GuideFlowConfig)
  })

  afterEach(() => {
    renderer.hideStep()
    undoVisible()
    document.body.innerHTML = ''
  })

  it('moves focus into the dialog', () => {
    render(renderer, { title: 'T', body: 'b' })

    const popover = document.querySelector('.gf-popover')!
    expect(popover.contains(document.activeElement)).toBe(true)
  })

  it('restores focus to whatever had it before the tour', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Start tour'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    render(renderer, { title: 'T', body: 'b' })
    expect(document.activeElement).not.toBe(trigger)

    renderer.hideStep()
    expect(document.activeElement).toBe(trigger)
  })

  it('captures the pre-tour element once, not on every step', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    render(renderer, { title: 'One', body: 'a' }, 0, 2)
    // Step 2 must not record a button *inside* the popover as the thing to
    // restore to — that element is about to be destroyed.
    render(renderer, { title: 'Two', body: 'b' }, 1, 2)

    renderer.hideStep()
    expect(document.activeElement).toBe(trigger)
  })

  it('does not throw when the restore target has left the DOM', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    render(renderer, { title: 'T', body: 'b' })
    trigger.remove()

    expect(() => { renderer.hideStep() }).not.toThrow()
  })

  it('wraps Tab from the last control back to the first', () => {
    render(renderer, { title: 'T', body: 'b' }, 1, 3)

    const popover = document.querySelector<HTMLElement>('.gf-popover')!
    const buttons = Array.from(popover.querySelectorAll('button'))
    const first = buttons[0]!
    const last = buttons[buttons.length - 1]!

    last.focus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(renderer, { title: 'T', body: 'b' }, 1, 3)

    const popover = document.querySelector<HTMLElement>('.gf-popover')!
    const buttons = Array.from(popover.querySelectorAll('button'))
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

  it('pulls focus back when the page steals it', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    render(renderer, { title: 'T', body: 'b' })
    outside.focus()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    const popover = document.querySelector('.gf-popover')!
    expect(popover.contains(document.activeElement)).toBe(true)
  })

  it('leaves Tab alone in the middle of the dialog', () => {
    render(renderer, { title: 'T', body: 'b' }, 1, 3)

    const buttons = Array.from(document.querySelectorAll('.gf-popover button'))
    // Somewhere that is neither the first nor the last stop.
    ;(buttons[1] as HTMLElement).focus()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    // The browser's own tab order should handle it.
    expect(event.defaultPrevented).toBe(false)
  })

  it('stops trapping once the step is hidden', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    render(renderer, { title: 'T', body: 'b' })
    renderer.hideStep()
    outside.focus()

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})

describe('a11y — keyboard does not hijack form controls', () => {
  const flow: FlowDefinition = {
    id: 'kb',
    initial: 'a',
    states: {
      a: {
        steps: [
          { id: 's1', content: { title: 'One', body: 'a' } },
          { id: 's2', content: { title: 'Two', body: 'b' } },
        ],
        on: { NEXT: 'done' },
      },
      done: { final: true },
    },
  }

  let gf: ReturnType<typeof createGuideFlow>

  beforeEach(() => {
    // A saved snapshot would resume onto step 2 and break every assertion
    // about which step we started on.
    localStorage.clear()
    gf = createGuideFlow({ injectStyles: false })
  })

  afterEach(() => {
    gf.destroy()
    document.body.innerHTML = ''
  })

  function press(key: string, target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }

  it('ignores arrow keys aimed at a text input', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)

    await gf.start(flow)
    const before = gf.currentStepId

    const event = press('ArrowRight', input)

    expect(event.defaultPrevented).toBe(false)
    expect(gf.currentStepId).toBe(before)
  })

  it.each(['TEXTAREA', 'SELECT'])('ignores arrow keys aimed at a <%s>', async (tag) => {
    const el = document.createElement(tag.toLowerCase())
    document.body.appendChild(el)

    await gf.start(flow)
    const before = gf.currentStepId

    press('ArrowRight', el)
    expect(gf.currentStepId).toBe(before)
  })

  it('ignores arrow keys inside a contenteditable region', async () => {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    host.appendChild(child)
    document.body.appendChild(host)

    await gf.start(flow)
    const before = gf.currentStepId

    // The event target is the inner span; the guard has to walk up.
    press('ArrowRight', child)
    expect(gf.currentStepId).toBe(before)
  })

  it('still navigates from contenteditable="false"', async () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'false')
    document.body.appendChild(el)

    await gf.start(flow)
    press('ArrowRight', el)
    await Promise.resolve()

    expect(gf.currentStepId).toBe('s2')
  })

  it.each(['textbox', 'slider', 'combobox', 'listbox', 'menuitem'])(
    'ignores arrow keys on role="%s"',
    async (role) => {
      const el = document.createElement('div')
      el.setAttribute('role', role)
      document.body.appendChild(el)

      await gf.start(flow)
      const before = gf.currentStepId

      press('ArrowRight', el)
      expect(gf.currentStepId).toBe(before)
    },
  )

  it('ignores a keystroke that is part of an IME composition', async () => {
    await gf.start(flow)
    const before = gf.currentStepId

    press('ArrowRight', document.body, { isComposing: true })
    expect(gf.currentStepId).toBe(before)
  })

  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
    ['altKey', { altKey: true }],
  ])('ignores an arrow key modified with %s', async (_name, init) => {
    await gf.start(flow)
    const before = gf.currentStepId

    press('ArrowRight', document.body, init)
    expect(gf.currentStepId).toBe(before)
  })

  it('ignores a key another handler already claimed', async () => {
    await gf.start(flow)
    const before = gf.currentStepId

    const claim = (e: Event): void => { e.preventDefault() }
    document.body.addEventListener('keydown', claim)
    press('ArrowRight', document.body)
    document.body.removeEventListener('keydown', claim)

    expect(gf.currentStepId).toBe(before)
  })

  it('still navigates from a plain arrow key on the page', async () => {
    await gf.start(flow)

    press('ArrowRight', document.body)
    await Promise.resolve()

    expect(gf.currentStepId).toBe('s2')
  })

  it('closes on Escape even from inside a field', async () => {
    // Escape is a modal dialog's guaranteed exit, and a user typing in a
    // clickThrough step has no other keyboard way out.
    const input = document.createElement('input')
    document.body.appendChild(input)

    await gf.start(flow)
    expect(gf.isActive).toBe(true)

    const event = press('Escape', input)

    expect(event.defaultPrevented).toBe(true)
    expect(gf.isActive).toBe(false)
  })

  it('leaves Escape to the IME during composition', async () => {
    await gf.start(flow)

    press('Escape', document.body, { isComposing: true })
    expect(gf.isActive).toBe(true)
  })
})

describe('a11y — reduced motion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('scrolls instantly when the user asks for reduced motion', async () => {
    const { scrollTargetIntoView } = await import('../engine/popover.js')

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))

    const el = document.createElement('div')
    const spy = vi.fn()
    el.scrollIntoView = spy
    document.body.appendChild(el)

    scrollTargetIntoView(el)

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
    el.remove()
  })

  it('scrolls smoothly otherwise', async () => {
    const { scrollTargetIntoView } = await import('../engine/popover.js')

    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }))

    const el = document.createElement('div')
    const spy = vi.fn()
    el.scrollIntoView = spy
    document.body.appendChild(el)

    scrollTargetIntoView(el)

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    el.remove()
  })
})

describe('a11y — hotspot', () => {
  let manager: HotspotManager

  beforeEach(() => {
    manager = new HotspotManager()
  })

  afterEach(() => {
    manager.removeAll()
    document.body.innerHTML = ''
  })

  function addHotspot(options: Parameters<HotspotManager['add']>[1] = {}): string {
    const target = document.createElement('div')
    target.id = 'hotspot-target'
    document.body.appendChild(target)
    return manager.add('#hotspot-target', options)
  }

  it('points the beacon at its tooltip so the body is announced', () => {
    // The tooltip carried `role="tooltip"` but nothing referenced it, so a
    // screen reader read the button label and stopped there.
    const id = addHotspot({ title: 'Filters', body: 'Narrow the list down' })

    const beacon = document.querySelector(`[data-gf-hotspot-id="${id}"]`)!
    const describedBy = beacon.getAttribute('aria-describedby')
    expect(describedBy).toBe(`${id}-tooltip`)
    expect(document.getElementById(describedBy!)?.textContent).toContain('Narrow the list down')
  })

  it('omits aria-describedby when there is no body to describe', () => {
    const id = addHotspot({ title: 'Filters' })

    const beacon = document.querySelector(`[data-gf-hotspot-id="${id}"]`)!
    // A dangling reference is worse than none: it is reported as an error and
    // announces nothing.
    expect(beacon.getAttribute('aria-describedby')).toBeNull()
  })

  it('is reachable and operable by keyboard', () => {
    const id = addHotspot({ title: 'Filters', body: 'b' })

    const beacon = document.querySelector(`[data-gf-hotspot-id="${id}"]`)!
    expect(beacon.getAttribute('role')).toBe('button')
    expect(beacon.getAttribute('tabindex')).toBe('0')
    expect(beacon.getAttribute('aria-label')).toBe('Filters')
  })

  it('declares a WCAG 2.5.8 target size in its stylesheet', () => {
    addHotspot()
    // injectStyles() tags with data-gf, not id — and it dedupes globally, so
    // an earlier test in this file may already have injected it.
    const css = document.querySelector('[data-gf="gf-hotspot"]')?.textContent ?? ''
    expect(css).toContain('min-width: 24px')
    expect(css).toContain('min-height: 24px')
    // And stops the endless pulse for users who asked for less motion.
    expect(css).toContain('prefers-reduced-motion')
  })
})

describe('a11y — direction-aware placement', () => {
  // Far enough from the left edge that the mirrored placement still fits — a
  // placement that overflows falls through to the next in the sequence, and the
  // test would be measuring the fallback rather than the mirroring.
  const target = { x: 500, y: 200, width: 100, height: 40 }
  const popover = { x: 0, y: 0, width: 320, height: 160 }
  const viewport = { x: 0, y: 0, width: 1280, height: 800 }

  it('aligns -start to the left edge in LTR', async () => {
    const { computePosition } = await import('../engine/popover.js')
    const pos = computePosition(target, popover, 'bottom-start', viewport, 'ltr')
    expect(pos.x).toBe(target.x)
  })

  it('aligns -start to the right edge in RTL', async () => {
    const { computePosition } = await import('../engine/popover.js')
    // "start" is where text begins, which is the right in RTL — so the popover
    // hangs off the target's right edge (AUDIT `placement-math-not-direction-aware`).
    const pos = computePosition(target, popover, 'bottom-start', viewport, 'rtl')
    expect(pos.x).toBe(target.x + target.width - popover.width)
  })

  it('leaves physical left/right alone in RTL', async () => {
    const { computePosition } = await import('../engine/popover.js')
    // `left` is physical by convention, in floating-ui and in CSS. Mirroring it
    // would make `placement: 'left'` mean "right" for half the world.
    const ltr = computePosition(target, popover, 'right', viewport, 'ltr')
    const rtl = computePosition(target, popover, 'right', viewport, 'rtl')
    expect(rtl.x).toBe(ltr.x)
    expect(rtl.placement).toBe(ltr.placement)
  })

  it('defaults to LTR when no direction is given', async () => {
    const { computePosition } = await import('../engine/popover.js')
    expect(computePosition(target, popover, 'bottom-start', viewport).x)
      .toBe(computePosition(target, popover, 'bottom-start', viewport, 'ltr').x)
  })
})
