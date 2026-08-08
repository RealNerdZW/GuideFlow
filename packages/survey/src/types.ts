// ---------------------------------------------------------------------------
// Public types.
//
// A survey is a docked, non-blocking question. NPS is the named use case and
// the reason this exists; CSAT and a thumbs poll fall out of the same widget
// with different bounds.
//
// It is NOT a tour step type, which is what `PRODUCT-ROADMAP.md` used to say.
// A step-type survey inherits all four limits `apps/docs/guide/announcements.md`
// records against the `target: null` modal — the overlay dims the page, only
// one can be up, the chrome needs a custom renderer, and, worst here, it lands
// in the tour funnel: submitting would emit `tour:complete`, so NPS responses
// would be counted as completed tours by `@guideflow/analytics`. 7.8b spent a
// package fixing exactly those for announcements. See ADR-018.
// ---------------------------------------------------------------------------

import type { AudienceRule, FlowSchedule, GuidanceContext, GuideFlowInstance } from '@guideflow/core'
import type { BlockReason } from '@guideflow/core/targeting'

// ── Definition (input) ─────────────────────────────────────────────────────

/**
 * An ordered scale. One widget, three jobs.
 *
 * `{ min: 0, max: 10 }` is NPS, `{ min: 1, max: 5 }` is CSAT, `{ min: 1, max: 2 }`
 * is a thumbs poll. There is deliberately no `kind` discriminant yet: a second
 * question shape (multiple choice) is a different widget with different
 * keyboard semantics, and nothing in the audit asks for one.
 */
export interface SurveyScale {
  /** Inclusive. Default `0`. */
  min?: number
  /** Inclusive. Default `10`. */
  max?: number
  /** Label under the lowest value, e.g. "Not at all likely". */
  minLabel?: string
  /** Label under the highest value. */
  maxLabel?: string
}

/**
 * The optional "why?" shown after a score is chosen.
 *
 * Optional in the type, near-mandatory in practice: an NPS number with no
 * comment is a metric nobody can act on. It appears only once a score is
 * selected, so the first thing the user sees is one click, not a form.
 */
export interface SurveyFollowUp {
  label: string
  placeholder?: string
}

export interface SurveyTargeting<TContext extends GuidanceContext = GuidanceContext> {
  /** Glob or RegExp against `location.href`. */
  urlPattern?: string | RegExp
  audience?: AudienceRule | ((context: TContext) => boolean)
  schedule?: FlowSchedule
  /** Higher wins. Ties keep registration order. Default `0`. */
  priority?: number
  /**
   * Ask again this long after the last ask. Omit and asking once is final.
   *
   * Measured from when the survey was **shown**, not from when it was
   * answered — someone who closed it without answering has also been asked,
   * and re-asking them tomorrow is the behaviour people uninstall over. This
   * is what "NPS every 90 days" means: `cooldownMs: 90 * 24 * 3600_000`.
   *
   * Deliberately NOT `@guideflow/core/targeting`'s `FlowFrequency`. That
   * record is keyed by flow id under the `'caps'` suffix, which belongs to
   * targeting — `targeting.resetCaps()` would wipe survey cooldowns, and a
   * survey is not a flow. It also tracks session windows and global counts a
   * survey has no use for.
   */
  cooldownMs?: number
}

export interface SurveyDefinition<TContext extends GuidanceContext = GuidanceContext> {
  id: string
  /** The question. Plain text, rendered with `textContent`. */
  question: string
  scale?: SurveyScale
  followUp?: SurveyFollowUp
  /** Shown after submit. Default "Thank you." */
  thanks?: string
  /** Show a × that closes without answering. Default `true`. */
  dismissible?: boolean
  targeting?: SurveyTargeting<TContext>
  /**
   * Opaque revision marker for the QUESTION.
   *
   * Omit it and a completed survey never asks again (subject to `cooldownMs`).
   * Change it and everyone is asked again — you are asserting this is a
   * different question, not a reworded one. Same rule as
   * `@guideflow/banner`'s `version` and, underneath both, ADR-015.
   *
   * Rewording a question WITHOUT bumping this is the right call for a typo and
   * the wrong call for a change of meaning, and only you can tell those apart.
   */
  version?: string | number
}

// ── State (output) ─────────────────────────────────────────────────────────
//
// Produced objects use `readonly x: T | undefined`, NOT `readonly x?: T`. Under
// exactOptionalPropertyTypes an optional key on a produced object forces the
// conditional-spread idiom at every construction site.

/** Where the visible survey is in its own little lifecycle. */
export type SurveyPhase = 'asking' | 'thanks'

export interface SurveyView {
  readonly id: string
  readonly question: string
  readonly phase: SurveyPhase
  /** Every selectable value, in order. Derived from `scale`. */
  readonly values: readonly number[]
  readonly minLabel: string | undefined
  readonly maxLabel: string | undefined
  /** The chosen score, or `null` while nothing is chosen. */
  readonly score: number | null
  /** Present only once a score is chosen and the definition asked for one. */
  readonly followUp: SurveyFollowUp | undefined
  readonly thanks: string
  readonly dismissible: boolean
}

export interface SurveyState {
  /** The one visible survey, or `null`. Nested so `if (state.current)` narrows. */
  readonly current: SurveyView | null
  /** Eligible surveys waiting behind `current`. Excludes `current`. */
  readonly queued: number
  /** A tour is running: the surface is inert and visually hidden. */
  readonly tourActive: boolean
  /** False when there is no identity — nothing is read and nothing is written. */
  readonly persisted: boolean
  /** False until the first storage read resolves. Nothing paints before it. */
  readonly hydrated: boolean
}

// ── Diagnostics ────────────────────────────────────────────────────────────

/**
 * `blockedBy` reuses core's `BlockReason` union plus one of our own.
 *
 * `'cooldown'` is not in core's set because tours have no equivalent — their
 * frequency guard reports `'session'` / `'cooldown'` / `'total'` against a cap
 * record this package deliberately does not share.
 */
export type SurveyBlockReason = BlockReason | 'answered'

export interface SurveyEvaluation<TContext extends GuidanceContext = GuidanceContext> {
  readonly survey: SurveyDefinition<TContext>
  readonly eligible: boolean
  readonly priority: number
  readonly blockedBy: readonly SurveyBlockReason[]
}

// ── Events ─────────────────────────────────────────────────────────────────
//
// A plain callback, not the `TourEvents` bus — ADR-011 Decision 3, and the
// reason a survey is not a step type: `tour:complete` on submit would count
// every NPS response as a completed tour.

export type SurveyEvent =
  | { readonly type: 'show'; readonly surveyId: string }
  | {
      readonly type: 'response'
      readonly surveyId: string
      readonly score: number
      readonly comment: string | undefined
      /** Where the score sits on the scale, so a host need not know the bounds. */
      readonly normalized: number
    }
  | { readonly type: 'dismiss'; readonly surveyId: string; readonly answered: boolean }

// ── Options ────────────────────────────────────────────────────────────────

export interface SurveyOptions {
  /**
   * Mint and persist a first-party id when `context.userId` is unset.
   * Default `false` — this package cannot consult `@guideflow/analytics`'s
   * consent and Do-Not-Track policy. With it off a survey still renders and
   * still submits; only the "don't ask again" memory is skipped.
   */
  anonymousId?: boolean
  /**
   * Every state-affecting action. Synchronous, wrapped in try/catch.
   *
   * **This is where the answers go.** There is no backend (ADR-014), so a
   * `response` event that nothing listens to is an answer that is discarded.
   * Route it into your collector.
   */
  onEvent?: (event: SurveyEvent) => void
}

// ── Controller ─────────────────────────────────────────────────────────────

export interface SurveyController<TContext extends GuidanceContext = GuidanceContext> {
  /** Shaped for `useSyncExternalStore`. Pre-bound; pass directly. */
  readonly subscribe: (listener: () => void) => () => void
  /** Referentially stable while nothing changed. */
  readonly getSnapshot: () => SurveyState
  /** A frozen idle state with `hydrated: false`. SSR and hydration agree. */
  readonly getServerSnapshot: () => SurveyState

  /** Score every registered survey. Never shows anything, never writes. */
  evaluate(): readonly SurveyEvaluation<TContext>[]
  /** Choose a score. Does not submit — the user may still add a comment. */
  select(score: number): void
  /** Submit the chosen score and optional comment, then show the thanks. */
  submit(comment?: string): Promise<void>
  /** Close it. Records the ask either way, so the cooldown starts. */
  dismiss(): Promise<void>
  /** Replace the registered set. Dropping an id records nothing. */
  setSurveys(definitions: readonly SurveyDefinition<TContext>[]): void
  /** Clear this package's stored responses. Touches nothing else. */
  reset(): Promise<void>
  /** Re-read storage and re-derive. Call after your app changes `context.userId`. */
  refresh(): Promise<void>
  destroy(): void
}

/** Signature of {@link createSurveys}, kept here so `types.ts` is the contract. */
export type CreateSurveys = <TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definitions: readonly SurveyDefinition<TContext>[],
  options?: SurveyOptions,
) => SurveyController<TContext>
