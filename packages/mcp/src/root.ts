// ---------------------------------------------------------------------------
// The sandbox.
//
// This server reads files on behalf of a model, which means the only genuinely
// dangerous thing it can do is read a file the operator did not mean to expose.
// Every filesystem path in every tool goes through `resolveInRoot`, and there
// is deliberately no way to opt out.
//
// The root is chosen by the OPERATOR — an argv value or the working directory —
// never by a tool argument. A `root` parameter on a tool would let a model that
// had been talked into it point the server anywhere, which is the whole attack.
// ---------------------------------------------------------------------------

import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export class OutsideRootError extends Error {
  constructor(requested: string, root: string) {
    super(
      `Refused: "${requested}" is outside the server's root (${root}). ` +
        'Pass a path inside the root, or restart the server with a different --root.',
    )
    this.name = 'OutsideRootError'
  }
}

/**
 * Resolve the root once, at startup.
 *
 * `realpathSync` matters: on macOS `/tmp` is a symlink to `/private/tmp`, and
 * on Windows a junction resolves elsewhere entirely. Comparing a resolved
 * candidate against an UNresolved root would reject legitimate paths there, and
 * — worse — comparing an unresolved candidate against a resolved root would
 * accept a symlink that escapes.
 */
export function resolveRoot(input: string): string {
  const abs = resolve(input)
  try {
    return (realpathSync.native ?? realpathSync)(abs)
  } catch {
    // The directory may not exist yet. An absolute path is still a usable
    // boundary; every read against it will simply fail with ENOENT.
    return abs
  }
}

/**
 * Turn a caller-supplied path into an absolute one inside `root`, or throw.
 *
 * Both halves are load-bearing:
 *   - `resolve` collapses `..`, so `../../etc/passwd` becomes an absolute path
 *     that then fails the containment check rather than escaping;
 *   - the check is on path SEGMENTS via `relative`, not `startsWith`. A naive
 *     `abs.startsWith(root)` accepts `/srv/tours-secret` for a root of
 *     `/srv/tours`, because the prefix matches without the separator.
 *
 * Symlinks inside the root are resolved and re-checked, so a link planted in
 * the tours directory cannot point out of it.
 */
export function resolveInRoot(root: string, requested: string): string {
  const abs = isAbsolute(requested) ? resolve(requested) : resolve(root, requested)
  assertContained(root, abs, requested)

  // Then the physical check, against the nearest ancestor that actually
  // exists.
  //
  // Not simply `realpathSync(abs)` in a try/catch: that swallows the answer for
  // a path whose LEAF does not exist, and the interesting attack is a
  // non-existent file underneath a symlinked directory — `escape/new.flow.json`
  // where `escape` points out of the root. The lexical check passes and the
  // leaf cannot be resolved, so a catch-and-accept would let it through.
  //
  // Walking up finds `escape`, resolves it, and re-checks the reconstructed
  // path. A root with no existing ancestor at all cannot escape anywhere.
  const real = realpathOfNearestAncestor(abs)
  if (real !== null && real !== abs) assertContained(root, real, requested)
  return real ?? abs
}

/**
 * `abs` with its longest existing prefix replaced by that prefix's real path.
 *
 * Returns null when nothing on the path exists, which leaves the caller with
 * the lexical answer and an ENOENT to report.
 */
function realpathOfNearestAncestor(abs: string): string | null {
  const tail: string[] = []
  let cursor = abs

  for (;;) {
    try {
      // `.native` where available: on Windows the JS implementation and the OS
      // call disagree about short (8.3) versus long names, and mixing the two
      // makes `relative()` produce nonsense. One consistent source either way.
      const real = (realpathSync.native ?? realpathSync)(cursor)
      return tail.length === 0 ? real : resolve(real, ...tail.reverse())
    } catch {
      const parent = dirname(cursor)
      if (parent === cursor) return null // reached the filesystem root
      tail.push(basename(cursor))
      cursor = parent
    }
  }
}

function assertContained(root: string, candidate: string, requested: string): void {
  if (candidate === root) return
  const rel = relative(root, candidate)
  // `relative` returns '' for the root itself, a `..`-prefixed path for
  // anything above it, and an absolute path when the two are on different
  // Windows drives — all three of which are outside.
  if (rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))) return
  throw new OutsideRootError(requested, root)
}
