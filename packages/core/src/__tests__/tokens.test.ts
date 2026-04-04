import { describe, it, expect, afterEach } from 'vitest'

import { fromTailwind, fromRadix, fromShadcn } from '../tokens/index.js'

describe('Design Tokens', () => {
  const root = document.documentElement

  afterEach(() => {
    // Clear applied CSS custom properties
    root.style.cssText = ''
  })

  describe('fromTailwind', () => {
    it('applies CSS custom properties from Tailwind config', () => {
      fromTailwind({
        primary: { '100': '#e0e7ff', '600': '#4f46e5' },
        borderRadius: '8px',
      })
      expect(root.style.getPropertyValue('--gf-accent-color')).toBe('#4f46e5')
      expect(root.style.getPropertyValue('--gf-accent-fg')).toBe('#e0e7ff')
      expect(root.style.getPropertyValue('--gf-border-radius')).toBe('8px')
    })

    it('returns void (applies to DOM directly)', () => {
      const result = fromTailwind({ background: 'white' })
      expect(result).toBeUndefined()
      expect(root.style.getPropertyValue('--gf-popover-bg')).toBe('white')
    })
  })

  describe('fromRadix', () => {
    it('applies CSS from Radix color tokens using CSS vars', () => {
      fromRadix({
        accent: '--violet-9',
        background: '--slate-1',
      })
      expect(root.style.getPropertyValue('--gf-accent-color')).toBe('var(--violet-9)')
      expect(root.style.getPropertyValue('--gf-popover-bg')).toBe('var(--slate-1)')
    })
  })

  describe('fromShadcn', () => {
    it('applies CSS from shadcn/ui tokens', () => {
      fromShadcn({
        primary: '--primary',
        radius: '--radius',
      })
      expect(root.style.getPropertyValue('--gf-accent-color')).toBe('hsl(var(--primary))')
      expect(root.style.getPropertyValue('--gf-border-radius')).toBe('var(--radius)')
    })
  })
})
