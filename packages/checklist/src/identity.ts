// ---------------------------------------------------------------------------
// Whose checklist this is.
//
// Copied from `@guideflow/core/targeting`'s `identity()`, including the
// `anonymousId` opt-in and the reason it defaults off, rather than imported —
// that function is module-private, and reaching for it would make a 2.5 kB
// subpath a hard dependency of every checklist.
// ---------------------------------------------------------------------------

import type { GuidanceContext, GuideFlowInstance } from '@guideflow/core'

/**
 * Distinct from targeting's `'gf:anon-id'` on purpose.
 *
 * Neither key is swept by `resetUser()`, which only sweeps the `keyFn` prefix.
 * Sharing targeting's key would mean a checklist silently resurrecting a
 * frequency-cap identity the host had never opted into, and vice versa.
 */
const ANON_KEY = 'gf:checklist-anon-id'

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * `context.userId` when set. Otherwise `null` — nothing is read and nothing is
 * written, while flow-derived state still works for the session.
 *
 * Opting in to `anonymousId` mints a first-party identifier instead. Off by
 * default because this package cannot consult `@guideflow/analytics`'s consent
 * and Do-Not-Track policy: it does not depend on it, deliberately.
 */
export function identity<TContext extends GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  anonymousId: boolean,
): string | null {
  const userId = gf.context.userId
  if (typeof userId === 'string' && userId.length > 0) return userId
  if (!anonymousId || !isBrowser()) return null
  try {
    let id = localStorage.getItem(ANON_KEY)
    if (!id) {
      id = `anon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
      localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch {
    // Private mode, or storage disabled. Persistence is skipped; everything
    // else still works.
    return null
  }
}
