// ---------------------------------------------------------------------------
// Development-only diagnostics
// ---------------------------------------------------------------------------

/**
 * Best-effort production detection.
 *
 * Bundlers replace the literal text `process.env.NODE_ENV`, but this repo's
 * `noPropertyAccessFromIndexSignature` forbids that dotted form, so the bracket
 * access below is *not* substituted. The `typeof` guard is therefore what does
 * the real work: in a browser bundle with no Node shim `process` is undefined,
 * we cannot tell dev from prod, and we choose to warn. Every message guarded by
 * this helper reports a genuine misconfiguration that is worth one console line
 * in any environment.
 */
function isProduction(): boolean {
  return typeof process !== 'undefined' && process.env['NODE_ENV'] === 'production'
}

const _warned = new Set<string>()

/**
 * Emit `message` at most once per process, keyed on `key`.
 *
 * Used for configuration mistakes that would otherwise be silent — mounting
 * `<GuidePopover>` while core's renderer owns the popover, for example.
 */
export function warnOnce(key: string, message: string): void {
  if (isProduction()) return
  if (_warned.has(key)) return
  _warned.add(key)
  console.warn(message)
}

/** Test-only: forget which warnings have already fired. */
export function resetWarnOnce(): void {
  _warned.clear()
}
