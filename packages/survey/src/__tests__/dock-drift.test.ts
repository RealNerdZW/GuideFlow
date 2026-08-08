// ---------------------------------------------------------------------------
// The docked-surface helpers exist in three packages. This is what stops that
// from becoming three implementations.
//
// `createLiveRegion` and `setTourActive` are copied into @guideflow/checklist,
// @guideflow/banner and @guideflow/survey. ADR-017 argued the copy and ADR-018
// argued the third one: they are trivial DOM helpers, not three divergent
// implementations of a hard algorithm, and a shared package to hold ninety
// lines costs a manifest, a tsconfig, a tsup config, a README, a docs page and
// a slot in the fixed version group.
//
// The copies are deliberately NOT identical files — the checklist needs
// `restoreFocus` and neither of the others does, and each header explains its
// own context. So this compares FUNCTION BODIES, normalised, not files.
//
// `createLiveRegion` is the one that matters. Its correctness lives in details
// that are easy to "simplify" wrongly in one copy and not the others: clipping
// rather than display:none (which would remove it from the accessibility tree
// and produce a live region that never speaks), and the rAF clear-then-write
// that lets an identical string re-announce instead of being deduplicated.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

const COPIES = [
  { pkg: '@guideflow/checklist', path: '../../../checklist/src/widget/a11y.ts' },
  { pkg: '@guideflow/banner', path: '../../../banner/src/widget/a11y.ts' },
  { pkg: '@guideflow/survey', path: '../widget/a11y.ts' },
] as const

/**
 * The body of one exported function, with comments and whitespace removed.
 *
 * Brace-matched rather than regex-terminated: the body contains braces, and a
 * lazy `[\s\S]*?}` would stop at the first one inside it.
 */
function bodyOf(source: string, fnName: string): string {
  const start = source.indexOf(`export function ${fnName}(`)
  if (start === -1) throw new Error(`no ${fnName} found`)
  const open = source.indexOf('{', start)
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) throw new Error(`unbalanced braces in ${fnName}`)
  return source
    .slice(open, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf-8')
}

describe('the docked-surface helpers, across three packages', () => {
  const sources = COPIES.map((c) => ({ ...c, source: read(c.path) }))

  it('the extractor works (guards every assertion below from being vacuous)', () => {
    const body = bodyOf(sources[0]!.source, 'createLiveRegion')
    expect(body.length).toBeGreaterThan(200)
    expect(body).toContain('aria-live')
  })

  it('createLiveRegion is byte-identical once comments and whitespace are stripped', () => {
    const bodies = sources.map((s) => bodyOf(s.source, 'createLiveRegion'))
    // Reported per package, so a failure names which copy drifted.
    const [first, ...rest] = bodies
    rest.forEach((body, i) => {
      expect(body, `${sources[i + 1]!.pkg} drifted from ${sources[0]!.pkg}`).toBe(first)
    })
  })

  it('setTourActive is byte-identical too', () => {
    const bodies = sources.map((s) => bodyOf(s.source, 'setTourActive'))
    const [first, ...rest] = bodies
    rest.forEach((body, i) => {
      expect(body, `${sources[i + 1]!.pkg} drifted from ${sources[0]!.pkg}`).toBe(first)
    })
  })

  it('every copy clips its live region rather than hiding it', () => {
    // The specific mistake this is here to catch: display:none and
    // visibility:hidden both remove an element from the accessibility tree,
    // which is the classic way to ship a live region that never speaks.
    for (const { pkg, source } of sources) {
      const body = bodyOf(source, 'createLiveRegion')
      expect(body, pkg).toContain('clip-path:inset(50%)')
      expect(body, pkg).not.toContain('display:none')
      expect(body, pkg).not.toContain('visibility:hidden')
    }
  })

  it('every copy refcounts its stylesheet', () => {
    // injectStyles de-dupes by id, so an unconditional removeStyles in one
    // widget's destroy() strips the stylesheet from every surviving mount of
    // that same widget. @guideflow/checklist shipped that bug.
    for (const { pkg, source } of sources) {
      expect(source, pkg).toContain('export function retainStyles')
      expect(source, pkg).toContain('export function releaseStyles')
    }
  })
})
