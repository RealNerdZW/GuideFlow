// ---------------------------------------------------------------------------
// Which survey shows. A pure function of (definitions, record, url, now,
// context) — no DOM, no storage, no clock of its own.
//
// The three matchers are IMPORTED from `@guideflow/core/targeting`, never
// reimplemented. They carry behaviour a fresh copy would lose: a throwing
// audience predicate means "not eligible" rather than a crash, and an
// unparseable date bound is ignored rather than blocking forever.
// ---------------------------------------------------------------------------

import type { GuidanceContext } from '@guideflow/core'
import { matchAudience, matchSchedule, matchUrl } from '@guideflow/core/targeting'

import { isSuppressed, type SurveyRecord } from './store.js'
import type { SurveyBlockReason, SurveyDefinition, SurveyEvaluation, SurveyScale } from './types.js'

export interface EligibleEnv<TContext extends GuidanceContext = GuidanceContext> {
  readonly context: TContext
  readonly url: string
  readonly now: number
  readonly record: SurveyRecord
}

/** NPS, because that is what this feature is for. */
const DEFAULT_MIN = 0
const DEFAULT_MAX = 10

/**
 * The selectable values, in order.
 *
 * Clamped to 21 values. A "scale" with a hundred points is not a scale, it is a
 * number input, and rendering it as radios would produce a hundred tab stops.
 * Reversed bounds are normalised rather than rejected: `{ min: 10, max: 0 }` is
 * a typo with an obvious intent, and throwing on it would take down a host's
 * page over a survey.
 */
export function scaleValues(scale: SurveyScale | undefined): readonly number[] {
  const rawMin = Math.trunc(scale?.min ?? DEFAULT_MIN)
  const rawMax = Math.trunc(scale?.max ?? DEFAULT_MAX)
  const min = Math.min(rawMin, rawMax)
  const max = Math.max(rawMin, rawMax)
  const count = Math.min(max - min + 1, 21)
  return Array.from({ length: count }, (_, i) => min + i)
}

/**
 * Score every survey.
 *
 * Guard order is copied from `evaluateFlow`: the free checks (url, audience,
 * schedule) before the storage-derived one. Keeping the order identical means
 * two subsystems report the same first reason for the same situation, and
 * `blockedBy[0]` is what a person reads.
 */
export function evaluateSurvey<TContext extends GuidanceContext = GuidanceContext>(
  survey: SurveyDefinition<TContext>,
  env: EligibleEnv<TContext>,
): SurveyEvaluation<TContext> {
  const t = survey.targeting
  const priority = t?.priority ?? 0

  if (t?.urlPattern !== undefined && !matchUrl(t.urlPattern, env.url)) {
    return { survey, eligible: false, priority, blockedBy: ['url'] }
  }
  if (t?.audience !== undefined && !matchAudience(t.audience, env.context)) {
    return { survey, eligible: false, priority, blockedBy: ['audience'] }
  }
  if (t?.schedule !== undefined && !matchSchedule(t.schedule, env.now)) {
    return { survey, eligible: false, priority, blockedBy: ['schedule'] }
  }
  if (isSuppressed(env.record, survey.id, survey.version, t?.cooldownMs, env.now)) {
    return { survey, eligible: false, priority, blockedBy: ['answered'] }
  }
  const blockedBy: readonly SurveyBlockReason[] = []
  return { survey, eligible: true, priority, blockedBy }
}

/**
 * Every survey scored, highest priority first.
 *
 * Ties keep registration order — stable since ES2019, and the same rule
 * `createTargeting().evaluate()` uses, so `priority` means one thing across the
 * library rather than three.
 */
export function evaluateAll<TContext extends GuidanceContext = GuidanceContext>(
  surveys: readonly SurveyDefinition<TContext>[],
  env: EligibleEnv<TContext>,
): readonly SurveyEvaluation<TContext>[] {
  return surveys
    .map((survey) => evaluateSurvey(survey, env))
    .sort((a, b) => b.priority - a.priority)
}
