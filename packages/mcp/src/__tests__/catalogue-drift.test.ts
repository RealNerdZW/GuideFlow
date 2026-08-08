// ---------------------------------------------------------------------------
// The token pattern exists in two packages. This is what stops it becoming two
// patterns.
//
// `guideflow_translate_flow`'s whole value is the `token-lost` check, and that
// check is only true if it recognises exactly what the ENGINE substitutes. Core
// keeps `TOKEN` in `utils/interpolate.ts` and exports neither it nor
// `interpolate` from any subpath — the copy is deliberate, since exporting it
// would be public API on a package with a byte budget.
//
// A copy that drifts fails in the quiet direction: a pattern that matches less
// than the engine's reports no loss for a token the engine would have
// substituted, so the tool says the translation is fine and the personalisation
// disappears in production, in one locale, silently.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

import { tokensIn } from '../catalogue.js'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf-8')
}

/** The `const TOKEN = /…/g` literal, as written. */
function tokenLiteral(source: string): string {
  const match = /const TOKEN = (\/.+\/[a-z]*)/.exec(source)
  if (!match?.[1]) throw new Error('no `const TOKEN = /…/` found')
  return match[1]
}

describe('the {{token}} pattern, across two packages', () => {
  it('is byte-identical to core’s', () => {
    const core = tokenLiteral(read('../../../core/src/utils/interpolate.ts'))
    const mine = tokenLiteral(read('../catalogue.ts'))
    expect(mine).toBe(core)
  })

  it('reads the forms core documents', () => {
    // Named exactly as `interpolate`'s own doc comment lists them.
    expect(tokensIn('Hi {{firstName}}')).toEqual(['firstName'])
    expect(tokensIn('{{ user.name }} of {{plan}}')).toEqual(['plan', 'user.name'])
    // The fallback is translatable copy, so only the NAME is compared — a
    // translator rewriting "your plan" must not read as a lost token.
    expect(tokensIn('{{plan|your plan}}')).toEqual(['plan'])
    expect(tokensIn('{{plan|tu plan}}')).toEqual(['plan'])
    expect(tokensIn('no tokens here')).toEqual([])
    // A single brace is not a token; neither is a space-broken one.
    expect(tokensIn('{plan} and {{ plan name }}')).toEqual([])
  })
})
