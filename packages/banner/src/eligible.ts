// ---------------------------------------------------------------------------
// Which banner shows. A pure function of (definitions, record, url, now,
// context) — no DOM, no storage, no clock of its own.
//
// The three matchers are IMPORTED from `@guideflow/core/targeting`, never
// reimplemented. CLAUDE.md's rule after 7.9a deleted three independently-broken
// selector builders: if you need a matcher, import the one that exists. These
// also carry behaviour a fresh copy would silently lose — a throwing audience
// predicate means "not eligible" rather than taking down the page, and an
// unparseable date bound is ignored rather than blocking forever.
//
// `evaluateFlow` itself is deliberately NOT reused. It takes a FlowDefinition,
// which requires `initial` and `states`; a banner has neither, and its first
// act is a short-circuit on a `startTrigger` a banner does not have. Building a
// fake flow to satisfy the type is the kind of thing that reads fine and rots.
// ---------------------------------------------------------------------------

import type { GuidanceContext } from '@guideflow/core'
import { matchAudience, matchSchedule, matchUrl, type BlockReason } from '@guideflow/core/targeting'

import { isDismissed, type BannerRecord } from './store.js'
import type { BannerDefinition, BannerEvaluation } from './types.js'

export interface EligibleEnv<TContext extends GuidanceContext = GuidanceContext> {
  readonly context: TContext
  readonly url: string
  readonly now: number
  readonly record: BannerRecord
}

/**
 * Score one banner.
 *
 * Guard order is load-bearing and copied from `evaluateFlow`: the free checks
 * (url, audience, schedule) run before the storage-derived one (dismissed).
 * The record is already in memory here, but keeping the order identical means
 * the two subsystems report the same first reason for the same situation, and
 * `blockedBy[0]` is what a person reads.
 */
export function evaluateBanner<TContext extends GuidanceContext = GuidanceContext>(
  banner: BannerDefinition<TContext>,
  env: EligibleEnv<TContext>,
): BannerEvaluation<TContext> {
  const t = banner.targeting
  const priority = t?.priority ?? 0

  if (t?.urlPattern !== undefined && !matchUrl(t.urlPattern, env.url)) {
    return { banner, eligible: false, priority, blockedBy: ['url'] }
  }
  if (t?.audience !== undefined && !matchAudience(t.audience, env.context)) {
    return { banner, eligible: false, priority, blockedBy: ['audience'] }
  }
  if (t?.schedule !== undefined && !matchSchedule(t.schedule, env.now)) {
    return { banner, eligible: false, priority, blockedBy: ['schedule'] }
  }
  if (isDismissed(env.record, banner.id, banner.version)) {
    return { banner, eligible: false, priority, blockedBy: ['dismissed'] }
  }
  const blockedBy: readonly BlockReason[] = []
  return { banner, eligible: true, priority, blockedBy }
}

/**
 * Every banner scored, highest priority first.
 *
 * Ties keep registration order. `Array.prototype.sort` has been stable since
 * ES2019, and the tie-break matters: it is the same rule
 * `createTargeting().evaluate()` uses over `listFlows()`' Map insertion order,
 * so `priority` means one thing across the library rather than two.
 */
export function evaluateAll<TContext extends GuidanceContext = GuidanceContext>(
  banners: readonly BannerDefinition<TContext>[],
  env: EligibleEnv<TContext>,
): readonly BannerEvaluation<TContext>[] {
  return banners
    .map((banner) => evaluateBanner(banner, env))
    .sort((a, b) => b.priority - a.priority)
}
