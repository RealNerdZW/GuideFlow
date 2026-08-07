/**
 * `@guideflow/core/targeting` — who sees a flow, where, and how often.
 *
 * ```ts
 * import { createGuideFlow } from '@guideflow/core'
 * import { createTargeting } from '@guideflow/core/targeting'
 *
 * const gf = createGuideFlow({ context: { userId: 'u1', plan: 'pro' } })
 * gf.createFlow({
 *   id: 'billing-tour',
 *   targeting: {
 *     startTrigger: 'load',
 *     urlPattern: '/billing/**',
 *     audience: { where: { plan: 'pro' } },
 *     frequency: { maxPerSession: 1, cooldownMs: 7 * 24 * 3600_000 },
 *     priority: 10,
 *   },
 *   initial: 'main',
 *   states: { … },
 * })
 *
 * const targeting = createTargeting(gf)
 * targeting.install()
 * ```
 *
 * **Data in core, policy here.** `FlowDefinition.targeting` is types only, so a
 * flow stays a plain serialisable object a CMS can store. Everything that
 * *acts* on it lives in this subpath and hooks through existing public seams:
 * `gf.listFlows()`, `gf.progress`, `gf.on('tour:start')`, `gf.start()`.
 */
import type { GuideFlowInstance } from '../index.js'
import { watchHistory } from '../navigation/history.js'
import type { FlowDefinition, GuidanceContext, StartTrigger } from '../types/index.js'

import { loadCaps, recordShow, saveCaps } from './caps.js'
import { startFromUrl } from './deep-link.js'
import { emptyCaps, evaluateFlow, type CapRecord, type FlowEvaluation } from './rules.js'

export { matchUrl, matchAudience, matchSchedule, sessionCount, evaluateFlow, emptyCaps } from './rules.js'
export type { BlockReason, CapRecord, FlowEvaluation, EvaluationEnv } from './rules.js'
export { startFromUrl } from './deep-link.js'
export type { DeepLinkHost, DeepLinkOptions } from './deep-link.js'

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined'

/** 30 minutes of inactivity ends a session. */
const DEFAULT_SESSION_GAP_MS = 30 * 60_000

export interface TargetingOptions {
  /**
   * Caps that apply across every flow, not per flow. This is the knob that
   * stops a user being shown four tours in a row.
   */
  globals?: { maxPerSession?: number; cooldownMs?: number }
  /** Idle gap that ends a session, ms. Default 30 minutes. */
  sessionGapMs?: number
  /**
   * Mint and persist an identifier when `context.userId` is unset, so caps work
   * for anonymous visitors. Default `false`.
   *
   * **Off by default deliberately.** Turning it on makes GuideFlow store a
   * first-party identifier, and core cannot consult `@guideflow/analytics`'s
   * consent and Do-Not-Track policy — core never imports a sibling. With it
   * off, url/audience/schedule rules still work; only the frequency caps are
   * skipped.
   */
  anonymousId?: boolean
}

export interface TargetingEngine<TContext extends GuidanceContext = GuidanceContext> {
  /** Score every candidate. Never starts anything, never writes. */
  evaluate(trigger?: StartTrigger): Promise<Array<FlowEvaluation<TContext>>>
  /** Start the highest-priority eligible flow. Resolves to it, or null. */
  autoStart(trigger?: StartTrigger): Promise<FlowDefinition<TContext> | null>
  /** Consider `startTrigger: 'event'` flows whose `event` matches. */
  send(event: string): Promise<FlowDefinition<TContext> | null>
  /** Arm the `load` and `selector` triggers. No-op outside a browser. */
  install(): void
  resetCaps(): Promise<void>
  destroy(): void
}

const ANON_KEY = 'gf:anon-id'

export function createTargeting<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  options: TargetingOptions = {},
): TargetingEngine<TContext> {
  const sessionGapMs = options.sessionGapMs ?? DEFAULT_SESSION_GAP_MS
  const cleanups: Array<() => void> = []
  let destroyed = false
  /** Guards against two autoStart() calls in the same tick starting two tours. */
  let inFlight: Promise<FlowDefinition<TContext> | null> | null = null

  /**
   * Whose caps these are.
   *
   * `context.userId` when set. Otherwise `null` — and every frequency guard is
   * then skipped, while url/audience/schedule keep working. Opting in to
   * `anonymousId` mints a first-party identifier instead.
   */
  function identity(): string | null {
    const userId = gf.context.userId
    if (typeof userId === 'string' && userId.length > 0) return userId
    if (!options.anonymousId || !isBrowser()) return null
    try {
      let id = localStorage.getItem(ANON_KEY)
      if (!id) {
        id = `anon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
        localStorage.setItem(ANON_KEY, id)
      }
      return id
    } catch {
      // Private mode, or storage disabled. Caps are skipped; everything else
      // still applies.
      return null
    }
  }

  async function readCaps(): Promise<{ caps: CapRecord; userId: string | null }> {
    const userId = identity()
    if (!userId) return { caps: emptyCaps(), userId: null }
    return { caps: await loadCaps(gf.progress, userId), userId }
  }

  async function evaluate(
    trigger: StartTrigger = 'load',
  ): Promise<Array<FlowEvaluation<TContext>>> {
    const { caps, userId } = await readCaps()
    const url = isBrowser() ? window.location.href : ''
    const now = Date.now()
    const context = gf.context

    const out: Array<FlowEvaluation<TContext>> = []
    for (const flow of gf.listFlows()) {
      const completed = userId ? await gf.progress.isCompleted(userId, flow.id) : false
      const dismissed = userId ? await gf.progress.isDismissed(userId, flow.id) : false
      out.push(
        evaluateFlow(flow, {
          context,
          url,
          now,
          caps,
          sessionGapMs,
          completed,
          dismissed,
          trigger,
          ...(options.globals !== undefined && { globals: options.globals }),
        }),
      )
    }
    // Highest priority first; ties keep registration order, which is Map
    // insertion order from listFlows().
    return out.sort((a, b) => b.priority - a.priority)
  }

  /**
   * `only` narrows the candidates before the highest-priority eligible one is
   * picked. It is not on `TargetingEngine`, so it stays internal.
   *
   * The `selector` trigger needs it. `evaluateFlow` marks a flow eligible on
   * `startTrigger === 'selector'` alone — it never asks whether *that flow's*
   * selector is in the DOM, because rules.ts is pure and has no document. So
   * with two selector flows, an element appearing for one of them started
   * whichever had the higher priority (ties: registration order). MEASURED: a
   * tour whose own selector matched nothing ran because a *different* flow's
   * element appeared.
   */
  async function autoStart(
    trigger: StartTrigger = 'load',
    only?: (flow: FlowDefinition<TContext>) => boolean,
  ): Promise<FlowDefinition<TContext> | null> {
    if (destroyed) return null
    if (inFlight) return inFlight

    const run = (async (): Promise<FlowDefinition<TContext> | null> => {
      // Never interrupt. TourEngine.start() ends a running tour first, which
      // emits tour:abandon — analytics would log that as the user giving up.
      if (gf.isActive) return null

      const results = await evaluate(trigger)
      const winner = results.find((r) => r.eligible && (only === undefined || only(r.flow)))
      if (!winner) return null

      await gf.start(winner.flow)
      return winner.flow
    })()

    inFlight = run
    try {
      return await run
    } finally {
      inFlight = null
    }
  }

  async function send(event: string): Promise<FlowDefinition<TContext> | null> {
    if (destroyed) return null
    if (gf.isActive) return null

    const results = await evaluate('event')
    const winner = results.find((r) => r.eligible && r.flow.targeting?.event === event)
    if (!winner) return null
    await gf.start(winner.flow)
    return winner.flow
  }

  /**
   * Count a show off `tour:start`, not after `gf.start()` resolves.
   *
   * `start()` can return without starting — an unknown id, a dismissed flow, a
   * completed one — and a manual `gf.start()` elsewhere in the app must still
   * count against a global session cap.
   */
  const offStart = gf.on('tour:start', ({ flowId }: { flowId: string }) => {
    void (async () => {
      const userId = identity()
      if (!userId) return
      const caps = await loadCaps(gf.progress, userId)
      await saveCaps(gf.progress, userId, recordShow(caps, flowId, Date.now()))
    })()
  })
  cleanups.push(offStart)

  /**
   * Flows whose `selector` trigger has already fired *and started something* in
   * this page session.
   *
   * Without it the observer re-triggers forever: `check()` never disconnects,
   * so the first DOM mutation after the user closes a selector-started tour
   * starts it again, and the one after that, and the one after that. MEASURED —
   * `gf.stop()` followed by appending one `<span>` restarted the tour. A
   * frequency cap would have stopped it, but caps are optional and nothing
   * should need configuring to avoid an infinite re-trigger loop.
   *
   * Added only when `autoStart` actually returns a flow. A `null` — a tour was
   * already running, or the flow was ineligible — must stay retryable, or the
   * element appearing at a bad moment would suppress the flow for the whole
   * page session.
   */
  const selectorFired = new Set<string>()

  function install(): void {
    if (!isBrowser() || destroyed) return

    // `load` — evaluate now, and again on every route change.
    //
    // `watchHistory` rather than a bare `popstate` listener. MEASURED: a
    // `history.pushState` navigation — which is how every React/Vue/Svelte
    // router moves between routes — fired nothing at all, so a `load` flow
    // registered for a route the SPA pushed into was never evaluated. The docs
    // said "on every route change" and meant "on the back button".
    //
    // Importing it costs a copy inlined into this bundle (`splitting: false`),
    // but NOT a second patch: `watchHistory` keeps its refcount on
    // `Symbol.for('guideflow.navigation')` precisely so duplicate module copies
    // share one wrapper and one teardown.
    // A `?gf_tour=` link first, and it wins over `load`. Someone clicked it on
    // purpose; a tour that would have auto-started anyway can wait for the next
    // page. `startFromUrl` resolves to null unless the id names a registered
    // flow that opted in with `targeting.deepLink`.
    const deepLink = (): void => {
      void startFromUrl(gf).then((started) => { if (!started) void autoStart('load') })
    }

    deepLink()
    // Re-checked on route change, because an SPA can navigate *to* a deep link
    // internally. Stripping the parameter makes the re-check a cheap miss
    // rather than a loop.
    cleanups.push(watchHistory(deepLink))

    // `selector` — watch for the element appearing. Same primitive as
    // `waitForTarget` in @guideflow/core/navigation; duplicated rather than
    // shared because `splitting: false` would inline a shared module into both
    // bundles anyway.
    //
    // The candidate list is read INSIDE `check()`, and the observer is armed
    // whether or not a selector flow exists yet. Both halves are needed: the
    // list used to be filtered once at install time, so a flow registered
    // afterwards was invisible even when an observer existed — and with no
    // selector flow at install time no observer was created at all. That is the
    // ordering rule this used to be documented as, and it collided head-on with
    // the recipe in `apps/docs/guide/hosting-flows.md`, where flows arrive from
    // a `fetch` and are registered whenever it resolves.
    if (typeof MutationObserver === 'undefined') return
    /** Is this flow a selector flow whose own element is on the page right now? */
    const armed = (f: FlowDefinition<TContext>): boolean => {
      const t = f.targeting
      return (
        t?.startTrigger === 'selector' &&
        t.selector !== undefined &&
        !selectorFired.has(f.id) &&
        document.querySelector(t.selector) !== null
      )
    }
    const check = (): void => {
      if (gf.isActive || !gf.listFlows().some(armed)) return
      void autoStart('selector', armed).then((started) => {
        if (started) selectorFired.add(started.id)
      })
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { childList: true, subtree: true })
    cleanups.push(() => { observer.disconnect() })
  }

  async function resetCaps(): Promise<void> {
    const userId = identity()
    if (!userId) return
    await saveCaps(gf.progress, userId, emptyCaps())
  }

  function destroy(): void {
    destroyed = true
    for (const off of cleanups) off()
    cleanups.length = 0
  }

  return { evaluate, autoStart, send, install, resetCaps, destroy }
}

