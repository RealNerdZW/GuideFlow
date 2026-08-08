// ---------------------------------------------------------------------------
// What the Chrome Web Store will reject.
//
// The review is manual, slow, and its feedback arrives days later — so every
// requirement that CAN be checked mechanically is checked here instead of
// discovered after a rejection.
//
// This is not the whole review. Single-purpose policy, screenshot quality and
// the permission-justification prose are human judgements, and they live in
// `packages/devtools/store/`. This file covers the mechanical half.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

// See the note in no-network.test.ts: `--root` moves vitest's root and leaves
// cwd alone, so neither anchor alone survives both invocations.
const PKG = existsSync(resolve(process.cwd(), 'manifest.json'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages', 'devtools')

interface Manifest {
  manifest_version: number
  name: string
  description: string
  icons: Record<string, string>
  permissions: string[]
  host_permissions?: string[]
  content_security_policy?: { extension_pages?: string }
  action?: { default_icon?: Record<string, string> }
}

const manifest = JSON.parse(readFileSync(resolve(PKG, 'manifest.json'), 'utf-8')) as Manifest

/** A PNG's real dimensions, straight out of the IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file)
  const signature = bytes.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error(`${file} is not a PNG`)
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw new Error(`${file}: no IHDR`)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('the manifest', () => {
  it('is MV3', () => {
    // MV2 has not been accepted for new listings since 2022.
    expect(manifest.manifest_version).toBe(3)
  })

  it('has a name and description within the store limits', () => {
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.name.length).toBeLessThanOrEqual(75)
    expect(manifest.description.length).toBeGreaterThan(0)
    // The store truncates at 132 and shows this text in search results.
    expect(manifest.description.length).toBeLessThanOrEqual(132)
  })

  it('declares a content security policy with no remote code', () => {
    const csp = manifest.content_security_policy?.extension_pages ?? ''
    expect(csp).toContain("script-src 'self'")
    // 'unsafe-eval' and any remote origin are outright rejections.
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/https?:/)
  })

  it('requests no host permissions', () => {
    // The content script's <all_urls> match is the broad grant, and it is
    // justified in store/LISTING.md. A `host_permissions` entry on top of it
    // would additionally grant the service worker cross-origin fetch, which is
    // both unnecessary and the thing reviewers look hardest at.
    expect(manifest.host_permissions).toBeUndefined()
  })
})

describe('the icons', () => {
  // The originals were 15x16, 46x48 and 122x128 — a few pixels narrow each.
  // Chrome renders those squashed and the store requires an exact 128x128.
  // Nothing had ever measured them.
  for (const [key, path] of Object.entries(manifest.icons)) {
    it(`icons["${key}"] is exactly ${key}x${key}`, () => {
      const file = resolve(PKG, path)
      expect(existsSync(file), `${path} is missing`).toBe(true)

      const { width, height } = pngSize(file)
      const expected = Number(key)
      expect({ width, height }, `${path} is ${width}x${height}`).toEqual({
        width: expected,
        height: expected,
      })
    })
  }

  it('declares the 128px icon the store listing requires', () => {
    expect(manifest.icons['128']).toBeTruthy()
  })

  it('every action icon is square at its declared size too', () => {
    for (const [key, path] of Object.entries(manifest.action?.default_icon ?? {})) {
      const { width, height } = pngSize(resolve(PKG, path))
      expect({ width, height }, `${path} is ${width}x${height}`).toEqual({
        width: Number(key),
        height: Number(key),
      })
    }
  })
})

describe('the store submission pack', () => {
  // These are the artefacts a human needs in front of them to fill in the
  // dashboard. Their absence is what turns a 20-minute submission into an
  // afternoon of writing under time pressure.
  for (const file of ['store/LISTING.md', 'store/PRIVACY.md', 'store/SUBMITTING.md']) {
    it(`${file} exists`, () => {
      expect(existsSync(resolve(PKG, file)), `${file} is missing`).toBe(true)
    })
  }

  it('the privacy policy states the no-transmission claim the code enforces', () => {
    // `no-network.test.ts` is what keeps this true. If that guard is ever
    // removed, this sentence becomes a false statement in a published policy.
    const policy = readFileSync(resolve(PKG, 'store/PRIVACY.md'), 'utf-8')
    expect(policy.toLowerCase()).toContain('never')
    expect(policy).toMatch(/no-network\.test\.ts/)
  })
})
