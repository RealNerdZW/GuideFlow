import { describe, expect, it } from 'vitest'

import * as api from '../index.js'

describe('public surface', () => {
  it('exports exactly the headless entry points', () => {
    // The widget is a separate entry so a host rendering its own list pays
    // none of its bytes; nothing from `widget/` may leak in here.
    expect(Object.keys(api).sort()).toEqual([
      'CHECKLIST_STORAGE_SUFFIX',
      'createChecklist',
      'deriveChecklist',
    ])
  })

  it('publishes the storage suffix so a host can inspect the record', () => {
    expect(api.CHECKLIST_STORAGE_SUFFIX).toBe('checklist')
  })
})
