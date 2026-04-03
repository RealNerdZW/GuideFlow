import { describe, it, expect } from 'vitest'
import { isBrowser } from '../utils/ssr.js'

describe('isBrowser', () => {
  it('returns true when window and document exist', () => {
    // happy-dom provides window + document
    expect(isBrowser()).toBe(true)
  })
})
