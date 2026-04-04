import { describe, it, expect, afterEach } from 'vitest'

import { injectStyles, removeStyles, gfId } from '../utils/styles.js'

describe('styles utilities', () => {
  afterEach(() => {
    // Clean up injected styles (the impl uses data-gf attribute, not id)
    document.head.querySelectorAll('style[data-gf]').forEach((el) => el.remove())
  })

  describe('injectStyles', () => {
    it('injects a <style> element into the document head', () => {
      injectStyles('.test { color: red }', 'test-inject')
      const style = document.querySelector('style[data-gf="test-inject"]')
      expect(style).not.toBeNull()
      expect(style?.tagName).toBe('STYLE')
      expect(style?.textContent).toContain('.test { color: red }')
    })

    it('does not duplicate if same id already exists', () => {
      injectStyles('.a { color: red }', 'dup-test')
      injectStyles('.b { color: blue }', 'dup-test')
      const elements = document.querySelectorAll('style[data-gf="dup-test"]')
      expect(elements.length).toBe(1)
    })

    it('sets nonce attribute when provided', () => {
      injectStyles('.test { color: green }', 'nonce-test', 'abc123')
      const style = document.querySelector('style[data-gf="nonce-test"]')
      expect(style?.getAttribute('nonce')).toBe('abc123')
    })
  })

  describe('removeStyles', () => {
    it('removes an injected style element by id', () => {
      injectStyles('.rm { color: red }', 'remove-test')
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
