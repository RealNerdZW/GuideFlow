/**
 * `@guideflow/survey` — a docked, non-blocking NPS / CSAT question.
 *
 * ```ts
 * import { createGuideFlow } from '@guideflow/core'
 * import { createSurveys } from '@guideflow/survey'
 * import { mountSurvey } from '@guideflow/survey/widget'
 *
 * const gf = createGuideFlow({ context: { userId: 'u1', plan: 'pro' } })
 *
 * const surveys = createSurveys(
 *   gf,
 *   [
 *     {
 *       id: 'nps',
 *       question: 'How likely are you to recommend us to a colleague?',
 *       scale: { min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' },
 *       followUp: { label: 'What is the main reason for your score?' },
 *       targeting: { audience: { where: { plan: 'pro' } }, cooldownMs: 90 * 24 * 3600_000 },
 *     },
 *   ],
 *   { onEvent: (e) => collector.track(`guideflow.survey.${e.type}`, e) },
 * )
 *
 * mountSurvey(surveys)
 * ```
 *
 * **The answers go to `onEvent` and nowhere else.** There is no backend
 * (ADR-014), so a `response` event nothing listens to is an answer that is
 * discarded. Wire it to your collector.
 *
 * Headless by design: the controller is `subscribe` / `getSnapshot` /
 * `getServerSnapshot`, so React, Vue and Svelte consume it with no adapter, and
 * `mountSurvey` is one possible view in a separate subpath.
 *
 * See ADR-018 for why this is a docked surface rather than a tour step type,
 * and why it is an eleventh package.
 */

export { createSurveys } from './controller.js'
export { evaluateSurvey, evaluateAll, scaleValues, type EligibleEnv } from './eligible.js'
export { SUFFIX as SURVEY_STORAGE_SUFFIX } from './store.js'

export type {
  CreateSurveys,
  SurveyBlockReason,
  SurveyController,
  SurveyDefinition,
  SurveyEvaluation,
  SurveyEvent,
  SurveyFollowUp,
  SurveyOptions,
  SurveyPhase,
  SurveyScale,
  SurveyState,
  SurveyTargeting,
  SurveyView,
} from './types.js'
