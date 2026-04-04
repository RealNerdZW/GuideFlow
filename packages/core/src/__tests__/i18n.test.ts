import { describe, it, expect, beforeEach } from 'vitest'

import { I18nRegistry } from '../i18n/index.js'

describe('I18nRegistry', () => {
  let i18n: I18nRegistry

  beforeEach(() => {
    i18n = new I18nRegistry()
  })

  it('returns English strings by default', () => {
    expect(i18n.t('next')).toBe('Next')
    expect(i18n.t('prev')).toBe('Back')
    expect(i18n.t('close')).toBe('Close')
  })

  it('interpolates variables', () => {
    const result = i18n.t('stepOf', { current: 2, total: 5 })
    expect(result).toBe('Step 2 of 5')
  })

  it('registers and uses a locale', () => {
    i18n.register('fr', { next: 'Suivant', prev: 'Précédent', close: 'Fermer' })
    i18n.use('fr')
    expect(i18n.t('next')).toBe('Suivant')
    expect(i18n.t('prev')).toBe('Précédent')
  })

  it('falls back to English for missing keys in locale', () => {
    i18n.register('de', { next: 'Weiter' })
    i18n.use('de')
    expect(i18n.t('next')).toBe('Weiter')
    // 'done' not registered in 'de' — falls back to EN
    expect(i18n.t('done')).toBe('Done')
  })

  it('warns and falls back on unknown locale', () => {
    i18n.use('xx')
    // Should not throw; falls back to en
    expect(i18n.t('next')).toBe('Next')
  })
})
