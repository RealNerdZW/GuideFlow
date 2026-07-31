// ---------------------------------------------------------------------------
// The public entry point. Guards against an export being renamed or dropped
// without anyone noticing — the barrel had no test at all before.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import * as api from '../index.js'

const EXPECTED_EXPORTS = [
  'TourProvider',
  'useGuideFlow',
  'useTourRenderer',
  'createHeadlessRenderer',
  'useTour',
  'useTourStep',
  'useHotspot',
  'TourStep',
  'GuidePopover',
  'HotspotBeacon',
  'ConversationalPanel',
] as const

// `import * as api` plus a computed lookup trips import/namespace, which cannot
// validate dynamic member access on a namespace object.
const exported = api as unknown as Record<string, unknown>

describe('@guideflow/react public API', () => {
  it.each(EXPECTED_EXPORTS)('exports %s as a function', (name) => {
    expect(typeof exported[name]).toBe('function')
  })

  it('exports nothing unexpected', () => {
    expect(Object.keys(api).sort()).toEqual([...EXPECTED_EXPORTS].sort())
  })
})
