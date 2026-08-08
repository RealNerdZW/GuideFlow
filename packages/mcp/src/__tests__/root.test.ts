// ---------------------------------------------------------------------------
// The sandbox.
//
// This server reads files on behalf of a model. The only genuinely dangerous
// thing it can do is read one the operator did not mean to expose, so this is
// the file that matters most in the package.
// ---------------------------------------------------------------------------

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import { OutsideRootError, resolveInRoot, resolveRoot } from '../root.js'

let root: string
let outside: string
let sandbox: string

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'gf-mcp-'))
  root = resolve(sandbox, 'tours')
  outside = resolve(sandbox, 'secrets')
  mkdirSync(root, { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(root, 'welcome.flow.json'), '{}')
  writeFileSync(join(outside, 'credentials.txt'), 'hunter2')
  // A sibling whose name STARTS WITH the root's — the case a naive
  // `startsWith` check accepts.
  mkdirSync(resolve(sandbox, 'tours-secret'), { recursive: true })
  writeFileSync(resolve(sandbox, 'tours-secret', 'leak.txt'), 'nope')
  root = resolveRoot(root)
})

afterAll(() => {
  // Best effort, and deliberately not allowed to fail the suite. Windows
  // returns ENOTEMPTY removing a tree that contains a junction, however many
  // retries you give it — and a leftover directory under the OS temp dir is
  // not a test result. Junctions first, so the common case still cleans up.
  for (const link of ['escape', 'escape2']) {
    try {
      rmSync(join(root, link), { recursive: true, force: true })
    } catch {
      /* never existed, or the platform refused the symlink in the first place */
    }
  }
  try {
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5 })
  } catch {
    /* the OS will reap it */
  }
})

describe('resolveRoot', () => {
  it('returns an absolute, symlink-resolved path', () => {
    expect(resolve(root)).toBe(root)
  })

  it('tolerates a directory that does not exist yet', () => {
    // An absolute path is still a usable boundary; reads then fail with ENOENT.
    const missing = resolveRoot(join(sandbox, 'not-created'))
    expect(missing.endsWith('not-created')).toBe(true)
  })
})

describe('resolveInRoot', () => {
  it('accepts a relative path inside the root', () => {
    expect(resolveInRoot(root, 'welcome.flow.json')).toBe(join(root, 'welcome.flow.json'))
  })

  it('accepts an absolute path inside the root', () => {
    const abs = join(root, 'welcome.flow.json')
    expect(resolveInRoot(root, abs)).toBe(abs)
  })

  it('accepts the root itself', () => {
    expect(resolveInRoot(root, '.')).toBe(root)
  })

  it('accepts a path that has not been created yet', () => {
    // Needed so a caller can be told ENOENT rather than "refused" for an
    // ordinary typo.
    expect(resolveInRoot(root, 'new.flow.json')).toBe(join(root, 'new.flow.json'))
  })

  it('refuses ../ traversal', () => {
    expect(() => resolveInRoot(root, '../secrets/credentials.txt')).toThrow(OutsideRootError)
  })

  it('refuses deep ../ traversal', () => {
    expect(() => resolveInRoot(root, '../../../../../../etc/passwd')).toThrow(OutsideRootError)
  })

  it('refuses traversal buried mid-path', () => {
    // `resolve` collapses this to the secrets directory before the check runs.
    expect(() => resolveInRoot(root, 'a/b/../../../secrets/credentials.txt')).toThrow(
      OutsideRootError,
    )
  })

  it('refuses an absolute path outside the root', () => {
    expect(() => resolveInRoot(root, join(outside, 'credentials.txt'))).toThrow(OutsideRootError)
  })

  it('refuses a SIBLING whose name starts with the root’s', () => {
    // The bug a naive `abs.startsWith(root)` has: "/…/tours-secret" has
    // "/…/tours" as a string prefix, without the separator. The check is on
    // path segments for exactly this.
    const sibling = resolve(sandbox, 'tours-secret', 'leak.txt')
    expect(() => resolveInRoot(root, sibling)).toThrow(OutsideRootError)
  })

  it('refuses a symlink inside the root that points outside it', () => {
    // The lexical check passes — the path IS inside the root — so only
    // resolving the link catches this.
    const link = join(root, 'escape')
    try {
      symlinkSync(outside, link, 'junction')
    } catch {
      // Windows without developer mode refuses symlink creation for an
      // unprivileged process. Skipping is honest; the assertion below would
      // otherwise test nothing.
      return
    }
    expect(() => resolveInRoot(root, 'escape/credentials.txt')).toThrow(OutsideRootError)
  })

  it('refuses a NON-EXISTENT file underneath a symlink that points outside', () => {
    // The case a `try { realpathSync(abs) } catch { accept }` would let
    // through: the leaf cannot be resolved because it does not exist, so the
    // only thing that catches it is resolving the nearest existing ancestor.
    const link = join(root, 'escape2')
    try {
      symlinkSync(outside, link, 'junction')
    } catch {
      return
    }
    expect(() => resolveInRoot(root, 'escape2/brand-new.flow.json')).toThrow(OutsideRootError)
  })

  it('names the offending path and the root in the message', () => {
    // An agent that gets refused needs to know what to do next.
    try {
      resolveInRoot(root, '../secrets/credentials.txt')
      expect.unreachable('should have thrown')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('../secrets/credentials.txt')
      expect(message).toContain(root)
      expect(message).toContain('--root')
    }
  })

  it('is not fooled by a trailing separator on the root', () => {
    expect(() => resolveInRoot(root + sep, '../secrets/credentials.txt')).toThrow(OutsideRootError)
  })
})
