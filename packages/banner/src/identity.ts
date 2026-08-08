// ---------------------------------------------------------------------------
// Whose dismissals these are.
//
// Copied from `@guideflow/checklist`'s `identity()`, which in turn copied
// `@guideflow/core/targeting`'s — that one is module-private, and reaching for
// it would make a 2.6 kB subpath a hard dependency of every banner. Fifty lines
// duplicated twice is the cheaper trade, and the precedent is documented.
// ---------------------------------------------------------------------------

import type { GuidanceContext, GuideFlowInstance } from '@guideflow/core'

/**
 * Distinct from targeting's `'gf:anon-id'` and the checklist's own key, on
 * purpose.
 *
 * None of the three is swept by `resetUser()`, which only sweeps the `keyFn`
 * prefix. Sharing a key would mean one surface silently resurrecting an
 * identity the host had only opted into for another.
 */
const ANON_KEY = 'gf:banner-anon-id'

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * `context.userId` when set. Otherwise `null` — nothing is read and nothing is
 * written, while banners still render for the session.
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
