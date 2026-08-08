// ---------------------------------------------------------------------------
// createSurveys() — the headless half.
//
// Which survey is visible is DERIVED, exactly as in `@guideflow/banner`. What
// is different, and the reason this is not a banner with a form in it, is that
// the visible survey has a lifecycle of its own — asking, then thanks — plus a
// pending score the user can change before submitting. That is transient state
// the controller owns and never persists.
// ---------------------------------------------------------------------------

import type { GuidanceContext, GuideFlowInstance } from '@guideflow/core'

import { evaluateAll, scaleValues, type EligibleEnv } from './eligible.js'
import { identity } from './identity.js'
import { clearRecord, loadRecord, recordAsk, type SurveyRecord } from './store.js'
import type {
  SurveyController,
  SurveyDefinition,
  SurveyEvaluation,
  SurveyEvent,
  SurveyOptions,
  SurveyState,
  SurveyView,
} from './types.js'

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

const EMPTY_RECORD: SurveyRecord = { v: 1, asked: {} }

const IDLE: SurveyState = Object.freeze({
  current: null,
  queued: 0,
  tourActive: false,
  persisted: false,
  hydrated: false,
})

const DEFAULT_THANKS = 'Thank you.'

export function createSurveys<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definitions: readonly SurveyDefinition<TContext>[],
  options: SurveyOptions = {},
): SurveyController<TContext> {
  let surveys = [...definitions]
  let record: SurveyRecord = EMPTY_RECORD
  let hydrated = false
  let destroyed = false
  let state: SurveyState = IDLE

  /** Transient, per-visible-survey, never persisted. */
  let pendingScore: number | null = null
  let phase: 'asking' | 'thanks' = 'asking'
  /** Which survey the transient state above belongs to. */
  let openId: string | null = null

  const listeners = new Set<() => void>()
  const cleanups: Array<() => void> = []
  let queue: Promise<void> = Promise.resolve()

  function emit(event: SurveyEvent): void {
    try {
      options.onEvent?.(event)
    } catch (error) {
      // A host analytics callback must never take the surface down with it —
      // and here it is also where the answers go, so a throw must not look
      // like a survey bug.
      console.error('[@guideflow/survey] onEvent threw. It was isolated.', error)
    }
  }

  function env(): EligibleEnv<TContext> {
    return {
      context: gf.context,
      url: isBrowser() ? window.location.href : '',
      now: Date.now(),
      record,
    }
  }

  function evaluate(): readonly SurveyEvaluation<TContext>[] {
    return evaluateAll(surveys, env())
  }

  function toView(def: SurveyDefinition<TContext>): SurveyView {
    return {
      id: def.id,
      question: def.question,
      phase,
      values: scaleValues(def.scale),
      minLabel: def.scale?.minLabel,
      maxLabel: def.scale?.maxLabel,
      score: pendingScore,
      // The follow-up appears only once a score is chosen, so the first thing
      // anyone sees is one click rather than a form.
      followUp: pendingScore === null ? undefined : def.followUp,
      thanks: def.thanks ?? DEFAULT_THANKS,
      dismissible: def.dismissible ?? true,
    }
  }

  /** Reuse the previous view object when nothing about it changed. */
  function reuse(next: SurveyView | null): SurveyView | null {
    const prev = state.current
    if (!prev || !next) return next
    if (
      prev.id === next.id &&
      prev.phase === next.phase &&
      prev.score === next.score &&
      prev.question === next.question &&
      prev.followUp === next.followUp &&
      prev.dismissible === next.dismissible &&
      prev.values.length === next.values.length
    ) {
      return prev
    }
    return next
  }

  function derive(): void {
    if (destroyed) return
    const eligible = evaluate().filter((r) => r.eligible)
    const head = eligible[0]

    // The transient state belongs to whichever survey is open. If the head
    // changed — a dismissal advanced the queue, or a route change made a
    // higher-priority one eligible — it must not carry over, or the new
    // question would arrive with the previous one's score already selected.
    if (head?.survey.id !== openId) {
      openId = head?.survey.id ?? null
      pendingScore = null
      phase = 'asking'
    }

    const current = reuse(head ? toView(head.survey) : null)
    const next: SurveyState = {
      current,
      queued: Math.max(0, eligible.length - 1),
      tourActive: gf.isActive,
      persisted: identity(gf, options.anonymousId ?? false) !== null,
      hydrated,
    }

    const changed =
      next.current !== state.current ||
      next.queued !== state.queued ||
      next.tourActive !== state.tourActive ||
      next.persisted !== state.persisted ||
      next.hydrated !== state.hydrated
    if (!changed) return

    const shown = next.current !== null && next.current.id !== state.current?.id
    state = next
    if (shown && next.current) emit({ type: 'show', surveyId: next.current.id })
    for (const listener of [...listeners]) listener()
  }

  async function hydrate(): Promise<void> {
    const userId = identity(gf, options.anonymousId ?? false)
    record = userId === null ? EMPTY_RECORD : await loadRecord(gf.progress, userId)
    hydrated = true
    derive()
  }

  /**
   * Write the ask, so the cooldown starts and it is not asked again.
   *
   * With no identity nothing is written and the suppression lasts the session,
   * in memory. Stated on the docs page rather than left to be discovered.
   */
  function persistAsk(def: SurveyDefinition<TContext>, answered: boolean): Promise<void> {
    const now = Date.now()
    const userId = identity(gf, options.anonymousId ?? false)
    if (userId === null) {
      record = {
        v: 1,
        asked: {
          ...record.asked,
          [def.id]: {
            at: now,
            ...(answered && { answeredAt: now }),
            ...(def.version !== undefined && { ver: def.version }),
          },
        },
      }
      return Promise.resolve()
    }
    const run = queue.then(async () => {
      record = await recordAsk(gf.progress, userId, def.id, def.version, answered, now)
    })
    queue = run.catch(() => undefined)
    return run
  }

  function currentDef(): SurveyDefinition<TContext> | undefined {
    const id = state.current?.id
    return id === undefined ? undefined : surveys.find((s) => s.id === id)
  }

  for (const name of ['tour:start', 'tour:complete', 'tour:abandon'] as const) {
    cleanups.push(gf.on(name, () => { derive() }))
  }

  // Route changes, armed only when something declares a `urlPattern`. Patching
  // history for every consumer — including the many with no url-scoped survey —
  // would be a page-global side effect taken for nothing.
  let unwatch: (() => void) | null = null

  function syncRouteWatch(): void {
    const needed = isBrowser() && surveys.some((s) => s.targeting?.urlPattern !== undefined)
    if (needed && !unwatch) {
      void import('@guideflow/core/navigation').then((nav) => {
        if (destroyed || unwatch) return
        unwatch = nav.watchHistory(() => { derive() })
      })
    } else if (!needed && unwatch) {
      unwatch()
      unwatch = null
    }
  }

  syncRouteWatch()
  void hydrate()

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    getServerSnapshot: () => IDLE,

    evaluate,

    select(score: number): void {
      if (destroyed || phase !== 'asking') return
      const view = state.current
      if (!view) return
      // Ignore a value that is not on the scale. A host driving the controller
      // directly should not be able to submit a score the question never
      // offered — that lands in someone's analytics as a real answer.
      if (!view.values.includes(score)) return
      pendingScore = score
      // Force a fresh view: `derive`'s change check compares object identity,
      // and `reuse` deliberately keys on score.
      state = { ...state, current: toView(surveys.find((s) => s.id === view.id) as SurveyDefinition<TContext>) }
      for (const listener of [...listeners]) listener()
    },

    async submit(comment?: string): Promise<void> {
      if (destroyed || phase !== 'asking') return
      const def = currentDef()
      if (!def || pendingScore === null) return

      const values = scaleValues(def.scale)
      const min = values[0] ?? 0
      const max = values[values.length - 1] ?? 0
      const span = max - min
      const trimmed = comment?.trim()

      emit({
        type: 'response',
        surveyId: def.id,
        score: pendingScore,
        comment: trimmed === undefined || trimmed === '' ? undefined : trimmed,
        // 0..1, so a host can compare a 0-10 NPS with a 1-5 CSAT without
        // knowing either scale's bounds. A one-point scale is 1, not NaN.
        normalized: span === 0 ? 1 : (pendingScore - min) / span,
      })

      // Persist BEFORE showing the thanks: if the write throws, the person has
      // still answered and must not be asked again on the next page load.
      await persistAsk(def, true)
      phase = 'thanks'
      state = { ...state, current: toView(def) }
      for (const listener of [...listeners]) listener()
    },

    async dismiss(): Promise<void> {
      if (destroyed) return
      const def = currentDef()
      if (!def) return
      const answered = phase === 'thanks'
      // Recorded either way, so closing without answering still starts the
      // cooldown. Someone who declined has been asked.
      await persistAsk(def, answered)
      emit({ type: 'dismiss', surveyId: def.id, answered })
      derive()
    },

    setSurveys(next: readonly SurveyDefinition<TContext>[]): void {
      if (destroyed) return
      surveys = [...next]
      syncRouteWatch()
      derive()
    },

    async reset(): Promise<void> {
      const userId = identity(gf, options.anonymousId ?? false)
      record = EMPTY_RECORD
      openId = null
      pendingScore = null
      phase = 'asking'
      if (userId !== null) await clearRecord(gf.progress, userId)
      derive()
    },

    async refresh(): Promise<void> {
      hydrated = false
      await hydrate()
    },

    destroy(): void {
      destroyed = true
      for (const off of cleanups) off()
      cleanups.length = 0
      unwatch?.()
      unwatch = null
      listeners.clear()
    },
  }
}
