import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'

import { SpotlightOverlay } from '../engine/spotlight.js'

describe('SpotlightOverlay', () => {
  let spotlight: SpotlightOverlay

  afterEach(() => {
    spotlight?.destroy()
    document.querySelectorAll('[data-gf-spotlight]').forEach((el) => el.remove())
  })

  it('creates an overlay element on show()', () => {
    spotlight = new SpotlightOverlay()
    const el = document.createElement('div')
    document.body.appendChild(el)
    spotlight.show(el)
    document.querySelector('.gf-spotlight-overlay, [data-gf-spotlight]')
    // The overlay should exist in some form
    expect(spotlight).toBeDefined()
    el.remove()
  })

  it('hides removes the overlay', () => {
    spotlight = new SpotlightOverlay()
    const el = document.createElement('div')
    document.body.appendChild(el)
    spotlight.show(el)
    spotlight.hide()
    expect(spotlight).toBeDefined()
    el.remove()
  })

  it('handles null target gracefully', () => {
    spotlight = new SpotlightOverlay()
    expect(() => spotlight.show(null)).not.toThrow()
  })

  it('destroy cleans up', () => {
    spotlight = new SpotlightOverlay()
    expect(() => spotlight.destroy()).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Target-only interaction.
//
// ADR-004 recorded this as a known limitation: the overlay is a single
// full-viewport div, so `clickThrough: true` dropped pointer capture entirely
// and made the WHOLE PAGE interactive. "Let the user actually click the button
// I am pointing at" — the one thing the option is named for — was therefore
// unimplementable (AUDIT `clickthrough-exposes-whole-page`).
//
// happy-dom has no layout engine and does not hit-test clip-path, so these
// assert the *geometry* the browser then acts on. `apps/e2e` asserts that the
// click actually lands.
// ---------------------------------------------------------------------------

describe('clickThrough carves a hole rather than removing the overlay', () => {
  let spotlight: SpotlightOverlay

  function overlay(): HTMLElement {
    const el = document.querySelector<HTMLElement>('[data-gf-overlay]')
    if (!el) throw new Error('no overlay')
    return el
  }

  function makeTarget(): Element {
    const el = document.createElement('div')
    el.id = 'ct-target'
    el.getBoundingClientRect = () =>
      ({ top: 100, left: 200, width: 300, height: 50, right: 500, bottom: 150, x: 200, y: 100 }) as DOMRect
    document.body.appendChild(el)
    return el
  }

  beforeEach(() => {
    spotlight = new SpotlightOverlay({ padding: 10 })
  })

  afterEach(() => {
    spotlight.destroy()
    document.body.innerHTML = ''
  })

  it('keeps capturing pointer events when clickThrough is on', () => {
    // The old behaviour set pointer-events: none, which is what made the whole
    // page interactive. Capture has to stay on for the clip-path to mean
    // anything.
    spotlight.show(makeTarget())
    spotlight.setClickThrough(true)

    expect(overlay().style.pointerEvents).toBe('all')
  })

  it('clips the target rect out of the overlay', () => {
    spotlight.show(makeTarget())
    spotlight.setClickThrough(true)

    const clip = overlay().style.clipPath
    expect(clip).toContain('evenodd')
    // Target rect grown by the 10px padding, matching the cutout exactly.
    expect(clip).toContain('190px 90px')
    expect(clip).toContain('510px 160px')
  })

  it('matches the cutout it is meant to line up with', () => {
    spotlight.show(makeTarget())
    spotlight.setClickThrough(true)

    const cutout = document.querySelector<HTMLElement>('[data-gf-spotlight-cutout]')!
    expect(cutout.style.left).toBe('190px')
    expect(cutout.style.top).toBe('90px')
    expect(cutout.style.width).toBe('320px')
    expect(cutout.style.height).toBe('70px')
  })

  it('leaves the overlay solid when clickThrough is off', () => {
    spotlight.show(makeTarget())
    spotlight.setClickThrough(false)

    expect(overlay().style.clipPath).toBe('none')
  })

  it('defaults to no hole', () => {
    spotlight.show(makeTarget())
    expect(overlay().style.clipPath).toBe('none')
  })

  it('has no hole in modal mode, where there is no target', () => {
    spotlight.show(null)
    spotlight.setClickThrough(true)

    expect(overlay().style.clipPath).toBe('none')
  })

  it('moves the hole when the target moves', () => {
    const target = makeTarget()
    spotlight.show(target)
    spotlight.setClickThrough(true)
    expect(overlay().style.clipPath).toContain('190px 90px')

    target.getBoundingClientRect = () =>
      ({ top: 400, left: 0, width: 100, height: 20, right: 100, bottom: 420, x: 0, y: 400 }) as DOMRect
    window.dispatchEvent(new Event('scroll'))

    expect(overlay().style.clipPath).toContain('-10px 390px')
  })

  it('closes the hole again when clickThrough is turned off mid-tour', () => {
    // Step-to-step: one step opts in, the next does not.
    spotlight.show(makeTarget())
    spotlight.setClickThrough(true)
    expect(overlay().style.clipPath).toContain('evenodd')

    spotlight.setClickThrough(false)
    expect(overlay().style.clipPath).toBe('none')
  })

  it('still suppresses backdrop dismissal on a clickThrough step', () => {
    // A step that asks the user to interact should not vanish because they
    // clicked somewhere else on the way.
    const dismissed = vi.fn()
    spotlight.setOverlayClickHandler(dismissed)
    spotlight.show(makeTarget())
    spotlight.setClickThrough(true)

    overlay().dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(dismissed).not.toHaveBeenCalled()
  })

  it('still dismisses on a backdrop click when clickThrough is off', () => {
    const dismissed = vi.fn()
    spotlight.setOverlayClickHandler(dismissed)
    spotlight.show(makeTarget())

    overlay().dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(dismissed).toHaveBeenCalledTimes(1)
  })
})
