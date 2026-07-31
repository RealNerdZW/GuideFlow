// ---------------------------------------------------------------------------
// @guideflow/vue — the published entry point
//
// Everything else imports the source modules directly. This file imports the
// barrel a consumer actually resolves, so a rename or a dropped re-export
// fails here rather than in someone's app.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import * as publicApi from '../index.js'

describe('@guideflow/vue public API', () => {
  it('exports exactly the documented runtime surface', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      ['GUIDEFLOW_KEY', 'GuideFlowPlugin', 'useGuideFlow', 'useHotspot', 'useTour'].sort(),
    )
  })

  it('exports callables and an installable plugin', () => {
    expect(typeof publicApi.useTour).toBe('function')
    expect(typeof publicApi.useHotspot).toBe('function')
    expect(typeof publicApi.useGuideFlow).toBe('function')
    expect(typeof publicApi.GuideFlowPlugin.install).toBe('function')
    expect(typeof publicApi.GUIDEFLOW_KEY).toBe('symbol')
  })
})
