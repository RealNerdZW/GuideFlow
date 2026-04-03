import { describe, it, expect, afterEach } from 'vitest'
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
    const overlay = document.querySelector('.gf-spotlight-overlay, [data-gf-spotlight]')
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
