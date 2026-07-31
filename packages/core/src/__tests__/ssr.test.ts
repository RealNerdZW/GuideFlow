import { describe, it, expect } from 'vitest'

import { isBrowser } from '../utils/ssr.js'

describe('isBrowser', () => {
  it('returns true when window and document exist', () => {
    // happy-dom provides window + document
    expect(isBrowser()).toBe(true)
  })
})

describe('navigation subpath is SSR-safe', () => {
  it('resolves without throwing when there is no window', async () => {
    const { createNavigation } = await import('../navigation/index.js')
    const adapter = createNavigation()

    const original = globalThis.window
    // @ts-expect-error — deliberately removing the global for this assertion
    delete globalThis.window
    try {
      const result = await adapter.resolveTarget({
        step: { id: 's', target: '#x', content: { title: 'x' } },
        state: { route: '/anywhere' },
        context: {},
        direction: 'forward',
        signal: new AbortController().signal,
        onWaiting: () => undefined,
      })
      expect(result).toEqual({ target: null })
    } finally {
      globalThis.window = original
    }
  })

  it('watchHistory returns a no-op teardown with no window', async () => {
    const { watchHistory } = await import('../navigation/history.js')

    const original = globalThis.window
    // @ts-expect-error — deliberately removing the global for this assertion
    delete globalThis.window
    try {
      const off = watchHistory(() => undefined)
      expect(typeof off).toBe('function')
      expect(() => off()).not.toThrow()
    } finally {
      globalThis.window = original
    }
  })

  it('waitForElement resolves null with no window', async () => {
    const { waitForElement } = await import('../navigation/wait.js')

    const original = globalThis.window
    // @ts-expect-error — deliberately removing the global for this assertion
    delete globalThis.window
    try {
      await expect(waitForElement('#x')).resolves.toBeNull()
    } finally {
      globalThis.window = original
    }
  })

  it('matchRoute is false with no window and no explicit url', async () => {
    const { matchRoute } = await import('../navigation/route.js')

    const original = globalThis.window
    // @ts-expect-error — deliberately removing the global for this assertion
    delete globalThis.window
    try {
      // A route can never match during SSR; pretending otherwise would render a
      // step against a page that does not exist yet.
      expect(matchRoute('/anything')).toBe(false)
    } finally {
      globalThis.window = original
    }
  })
})
