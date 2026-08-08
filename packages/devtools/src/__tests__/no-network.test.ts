// ---------------------------------------------------------------------------
// The extension makes no network calls, and this is what keeps that true.
//
// It is not a style preference. The Chrome Web Store listing's privacy
// disclosure and `store/PRIVACY.md` both state plainly that nothing this
// extension observes ever leaves the machine, and an extension that quietly
// grew a `fetch` would make a published privacy policy false — which is a
// different class of problem from a bug.
//
// The extension reads the DOM of every page the developer visits. That is a
// large amount of trust, and the only thing that makes it reasonable is that
// the data has nowhere to go.
//
// Asserted against the SOURCE rather than the bundle, so the failure names the
// file you have to look at. `verify-pack`-style bundle checks would say
// "somewhere in 140 kB".
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * This package's root, however the suite was invoked.
 *
 * Not `import.meta.url`: the environment here is happy-dom, where it is not
 * guaranteed to be a `file:` URL, and `fileURLToPath` then throws
 * ERR_INVALID_URL_SCHEME at collection time — before a single test runs, so the
 * failure names the import rather than the check.
 *
 * Not bare `process.cwd()` either: `pnpm --filter @guideflow/devtools test`
 * (what turbo runs) has cwd at the package, while `vitest --root
 * packages/devtools` from the repo root does not — `--root` moves vitest's root
 * and leaves cwd alone. A guard that only holds under one of those is not a
 * guard.
 */
const PKG = existsSync(resolve(process.cwd(), 'manifest.json'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages', 'devtools')
const SRC = resolve(PKG, 'src')

/** Every .ts/.tsx under src, excluding the tests themselves. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Comments stripped, so prose describing what the extension does NOT do cannot
 * fail the check that it does not do it.
 */
function code(file: string): string {
  return readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '')
}

/** Every way a browser extension can reach the network. */
const EXFILTRATION = [
  { name: 'fetch(', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /\bnew\s+WebSocket\b/ },
  { name: 'EventSource', pattern: /\bnew\s+EventSource\b/ },
  { name: 'navigator.sendBeacon', pattern: /\bsendBeacon\s*\(/ },
  { name: 'import() of a URL', pattern: /\bimport\s*\(\s*['"`]https?:/ },
]

describe('the extension never talks to the network', () => {
  const files = sourceFiles(SRC)

  it('finds the source to check (guards this file from being vacuous)', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  for (const { name, pattern } of EXFILTRATION) {
    it(`contains no ${name}`, () => {
      const offenders = files.filter((f) => pattern.test(code(f)))
      expect(
        offenders,
        `${name} found in:\n  ${offenders.join('\n  ')}\n\n` +
          'The published privacy policy states that nothing this extension observes leaves ' +
          'the machine. If that is changing, update store/PRIVACY.md and the Chrome Web Store ' +
          'data disclosure in the SAME change — a stale privacy policy is worse than no feature.',
      ).toEqual([])
    })
  }

  it('declares no host permissions beyond the content script it needs', () => {
    // `permissions` must stay free of anything that grants network reach.
    const manifest = JSON.parse(readFileSync(resolve(PKG, 'manifest.json'), 'utf-8')) as {
      permissions?: string[]
      host_permissions?: string[]
    }

    expect(manifest.permissions).toEqual(['activeTab', 'contextMenus', 'storage'])
    // host_permissions would grant fetch() to those origins from the service
    // worker, bypassing the page's own CORS. There are none, deliberately.
    expect(manifest.host_permissions).toBeUndefined()
  })
})
