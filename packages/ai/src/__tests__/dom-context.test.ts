import { describe, it, expect } from 'vitest'
import { serializeDOM } from '../dom-context.js'

describe('serializeDOM', () => {
  it('returns empty context in SSR (isBrowser fallback)', () => {
    // happy-dom provides document, but with no elements the result should be minimal
    const ctx = serializeDOM()
    expect(ctx).toHaveProperty('url')
    expect(ctx).toHaveProperty('title')
    expect(ctx).toHaveProperty('elements')
    expect(Array.isArray(ctx.elements)).toBe(true)
  })

  it('serializes interactive elements from a root', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button id="btn-1">Click me</button>
      <a href="/link">Link</a>
      <input name="email" type="email" placeholder="Email" />
      <h2>Heading</h2>
    `
    document.body.appendChild(root)

    const ctx = serializeDOM(root)
    expect(ctx.elements.length).toBeGreaterThanOrEqual(3) // button, a, input, h2

    // Check that button is among results
    const btn = ctx.elements.find((e) => e.tag === 'button')
    expect(btn).toBeDefined()
    expect(btn!.selector).toContain('#btn-1')
    expect(btn!.interactive).toBe(true)

    // Check heading
    const heading = ctx.elements.find((e) => e.tag === 'h2')
    expect(heading).toBeDefined()

    document.body.removeChild(root)
  })

  it('respects maxElements cap', () => {
    const root = document.createElement('div')
    for (let i = 0; i < 100; i++) {
      root.appendChild(Object.assign(document.createElement('button'), { textContent: `Btn ${i}` }))
    }
    document.body.appendChild(root)

    const ctx = serializeDOM(root, 5)
    expect(ctx.elements.length).toBeLessThanOrEqual(5)

    document.body.removeChild(root)
  })

  it('builds selectors from id, name, aria-label, and data-testid', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button id="by-id">Id</button>
      <input name="by-name" />
      <a aria-label="by-aria">Aria</a>
      <button data-testid="by-testid">TestId</button>
    `
    document.body.appendChild(root)

    const ctx = serializeDOM(root)
    const selectors = ctx.elements.map((e) => e.selector)
    expect(selectors.some((s) => s.includes('#by-id'))).toBe(true)
    expect(selectors.some((s) => s.includes('[name='))).toBe(true)
    expect(selectors.some((s) => s.includes('[aria-label='))).toBe(true)
    expect(selectors.some((s) => s.includes('[data-testid='))).toBe(true)

    document.body.removeChild(root)
  })

  it('marks interactive elements correctly', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <button>Interactive</button>
      <h1>Not interactive</h1>
    `
    document.body.appendChild(root)

    const ctx = serializeDOM(root)
    const btn = ctx.elements.find((e) => e.tag === 'button')
    const h1 = ctx.elements.find((e) => e.tag === 'h1')
    expect(btn?.interactive).toBe(true)
    expect(h1?.interactive).toBe(false)

    document.body.removeChild(root)
  })
})
