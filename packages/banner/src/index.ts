/**
 * `@guideflow/banner` — a docked, non-blocking announcement surface.
 *
 * ```ts
 * import { createGuideFlow } from '@guideflow/core'
 * import { createBanners } from '@guideflow/banner'
 * import { mountBanner } from '@guideflow/banner/widget'
 *
 * const gf = createGuideFlow({ context: { userId: 'u1', plan: 'pro' } })
 *
 * const banners = createBanners(gf, [
 *   {
 *     id: 'v2',
 *     title: 'We shipped v2',
 *     body: 'Faster exports and a new dashboard.',
 *     actions: [{ label: 'Take a look', variant: 'primary', flowId: 'v2-tour' }],
 *     targeting: {
 *       urlPattern: '/app/**',
 *       audience: { where: { plan: 'pro' } },
 *       schedule: { endsAt: '2026-09-01T00:00:00Z' },
 *     },
 *   },
 * ])
 *
 * mountBanner(banners, { dock: 'top' })
 * ```
 *
 * Headless by design: the controller is `subscribe` / `getSnapshot` /
 * `getServerSnapshot`, so React, Vue and Svelte consume it with no adapter and
 * `mountBanner` is one possible view rather than the only one. It is a separate
 * subpath so a host rendering its own bar never downloads the stylesheet.
 *
 * See ADR-017 for why this is a package rather than a core subpath, why one
 * banner shows at a time, and why dismissal is permanent unless you say
 * otherwise.
 */

export { createBanners } from './controller.js'
export { evaluateBanner, evaluateAll, type EligibleEnv } from './eligible.js'
export { SUFFIX as BANNER_STORAGE_SUFFIX } from './store.js'

export type {
  BannerAction,
  BannerController,
  BannerDefinition,
  BannerEvaluation,
  BannerEvent,
  BannerOptions,
  BannerState,
  BannerTargeting,
  BannerTone,
  BannerView,
  CreateBanners,
} from './types.js'
