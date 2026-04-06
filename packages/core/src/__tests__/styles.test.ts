import { describe, it, expect, afterEach } from 'vitest'

import { injectStyles, removeStyles, gfId } from '../utils/styles.js'

// Collect injected IDs during each test so afterEach can clean up properly
// via removeStyles() — which also clears the module-level injectedIds Set.
const _injected: string[] = []
function tracked(css: string, id: string, nonce?: string) {
  injectStyles(css, id, nonce)
  _injected.push(id)
}

describe('styles utilities', () => {
  afterEach(() => {
    // Use removeStyles() instead of manual DOM removal so the module-level
    // deduplication set (injectedIds) stays consistent between tests.
    _injected.splice(0).forEach((id) => removeStyles(id))
  })

  describe('injectStyles', () => {
    it('injects a <style> element into the document head', () => {
      tracked('.test { color: red }', 'test-inject')
      const style = document.querySelector('style[data-gf="test-inject"]')
      expect(style).not.toBeNull()
      expect(style?.tagName).toBe('STYLE')
      expect(style?.textContent).toContain('.test { color: red }')
    })

    it('does not duplicate if same id already exists', () => {
      tracked('.a { color: red }', 'dup-test')
      tracked('.b { color: blue }', 'dup-test')
      const elements = document.querySelectorAll('style[data-gf="dup-test"]')
      expect(elements.length).toBe(1)
    })

    it('sets nonce attribute when provided', () => {
      tracked('.test { color: green }', 'nonce-test', 'abc123')
      const style = document.querySelector('style[data-gf="nonce-test"]')
      expect(style?.getAttribute('nonce')).toBe('abc123')
    })
  })

  describe('removeStyles', () => {
    it('removes an injected style element by id', () => {
      tracked('.rm { color: red }', 'remove-test')
      expect(document.querySelector('style[data-gf="remove-test"]')).not.toBeNull()
      removeStyles('remove-test')
      expect(document.querySelector('style[data-gf="remove-test"]')).toBeNull()
    })

    it('does not throw when removing non-existent id', () => {
      expect(() => removeStyles('non-existent')).not.toThrow()
    })
  })

  describe('gfId', () => {
    it('generates unique ids with prefix', () => {
      const id1 = gfId('prefix')
      const id2 = gfId('prefix')
      expect(id1).toContain('prefix')
      expect(id2).toContain('prefix')
      expect(id1).not.toBe(id2)
    })
  })
})
