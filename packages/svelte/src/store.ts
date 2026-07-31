// ---------------------------------------------------------------------------
// createTourStore — Svelte store-based tour API
// ---------------------------------------------------------------------------

import {
  createGuideFlow,
  type FlowDefinition,
  type GuidanceContext,
  type GuideFlowConfig,
  type GuideFlowInstance,
  type HintStep,
  type HotspotOptions,
  type I18nRegistry,
  type ProgressStore,
  type Step,
  type StepContent,
} from '@guideflow/core'
import { writable, type Readable, type Writable } from 'svelte/store'

export interface TourStore {
  // ── Readable state ────────────────────────────────────────────────────────
  /** Whether a tour is currently active */
  isActive: Readable<boolean>
  /** Whether the active tour is paused. Mirrors `instance.isPaused`. */
  isPaused: Readable<boolean>
  /** Current step id */
  currentStepId: Readable<string | null>
  /** Current step index (0-based) */
  currentStepIndex: Readable<number>
  /** Total steps in current state */
  totalSteps: Readable<number>
  /** The step object currently on screen — `null` when no tour is running */
  currentStep: Readable<Step | null>
  /** The resolved content for that step (async `content` already awaited) */
  currentContent: Readable<StepContent | null>
  /** Active i18n locale. Only tracks changes made through `setLocale()`. */
  locale: Readable<string>

  // ── Navigation ────────────────────────────────────────────────────────────
  /** Start a flow */
  start: (flow: FlowDefinition | string, context?: GuidanceContext) => Promise<void>
  /** Advance to next step */
  next: () => Promise<void>
  /** Go back */
  prev: () => Promise<void>
  /** Jump to step by id */
  goTo: (stepId: string) => Promise<void>
  /** Send a state machine event */
  send: (event: string) => Promise<void>
  /** End / stop the tour */
  stop: () => void
  /** Hide the tour UI without abandoning the flow */
  pause: () => void
  /** Re-show a paused tour at the step it was paused on */
  resume: () => void
  /** Dismiss the tour the way a user would — emits `step:skip`, `tour:dismiss`, `tour:abandon` */
  skip: () => void

  // ── Flows & configuration ─────────────────────────────────────────────────
  /** Register a flow definition so `start('id')` can resolve it */
  createFlow: (definition: FlowDefinition) => FlowDefinition
  /** Every flow registered with `createFlow()` */
  listFlows: () => FlowDefinition[]
  /** Patch the instance configuration after creation */
  configure: (patch: Partial<GuideFlowConfig>) => void

  // ── Standalone UI ─────────────────────────────────────────────────────────
  /** Register a persistent hotspot beacon; returns its id (`''` on the server) */
  hotspot: (target: string | Element, options?: HotspotOptions) => string
  /** Remove a hotspot by id */
  removeHotspot: (id: string) => void
  /** Register hint markers */
  hints: (steps: HintStep[]) => void
  /** Show hint badges */
  showHints: () => void
  /** Hide hint badges */
  hideHints: () => void

  // ── Subsystems ────────────────────────────────────────────────────────────
  /** i18n registry for this instance */
  i18n: I18nRegistry
  /** Persistence / progress store for this instance */
  progress: ProgressStore
  /** Switch locale and update the `locale` store in one call */
  setLocale: (locale: string) => void

  /** The underlying GuideFlow instance */
  instance: GuideFlowInstance
  /**
   * `true` when this store created `instance` itself, and is therefore
   * responsible for destroying it. `false` when an instance was handed in.
   */
  ownsInstance: boolean
  /**
   * Detach this store's core event listeners. The underlying GuideFlow
   * instance is destroyed **only if this store created it** — an instance
   * passed into `createTourStore()` belongs to the caller and is left running,
   * along with any listeners the caller registered on it.
   *
   * Idempotent.
   */
  destroy: () => void
}

/**
 * Distinguish `createTourStore(gf)` from `createTourStore({ debug: true })`.
 *
 * `GuideFlowConfig` is a bag of plain options and declares neither `start` nor
 * `destroy`, so probing for both methods separates the two without depending
 * on a getter (`isActive`) that a future config field could shadow.
 */
function isInstance(value: GuideFlowConfig | GuideFlowInstance): value is GuideFlowInstance {
  const candidate = value as { start?: unknown; destroy?: unknown }
  return typeof candidate.start === 'function' && typeof candidate.destroy === 'function'
}

/** Expose only `subscribe`, so a component cannot write to the engine's state. */
function toReadable<T>(store: Writable<T>): Readable<T> {
  return { subscribe: store.subscribe }
}

/**
 * Create a Svelte-friendly tour store.
 *
 * The returned object is a plain object whose state fields are individual
 * readable stores. Svelte's `$` auto-subscription only applies to an
 * identifier that is itself a store, so `$tour.isActive` does not compile —
 * destructure the fields you need and prefix those.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createTourStore } from '@guideflow/svelte'
 *
 *   const tour = createTourStore({ debug: true })
 *   const { isActive, currentStepIndex, totalSteps } = tour
 * </script>
 *
 * <button on:click={() => tour.start(myFlow)}>Start</button>
 * {#if $isActive}Step {$currentStepIndex + 1} of {$totalSteps}{/if}
 * ```
 */
export function createTourStore(configOrInstance?: GuideFlowConfig | GuideFlowInstance): TourStore {
  // TypeScript narrows `configOrInstance` through this alias, so both branches
  // are already the right type — no cast needed.
  const adopted = configOrInstance !== undefined && isInstance(configOrInstance)
  const gf = adopted ? configOrInstance : createGuideFlow(configOrInstance ?? {})

  const _isActive: Writable<boolean> = writable(gf.isActive)
  // Seeded from the instance, not `false`: a store created while a tour is
  // already paused has no `tour:pause` event left to observe.
  const _isPaused: Writable<boolean> = writable(gf.isPaused)
  const _currentStepId: Writable<string | null> = writable(gf.currentStepId)
  const _currentStepIndex: Writable<number> = writable(gf.currentStepIndex)
  const _totalSteps: Writable<number> = writable(gf.totalSteps)
  const _currentStep: Writable<Step | null> = writable(gf.currentStep)
  const _currentContent: Writable<StepContent | null> = writable(gf.currentContent)
  const _locale: Writable<string> = writable(gf.i18n.activeLocale)

  const sync = (): void => {
    _isActive.set(gf.isActive)
    _currentStepId.set(gf.currentStepId)
    _currentStepIndex.set(gf.currentStepIndex)
    _totalSteps.set(gf.totalSteps)
    _currentStep.set(gf.currentStep)
    _currentContent.set(gf.currentContent)
  }

  /**
   * Reset to the idle values instead of reading them back off the instance.
   *
   * `tour:complete` / `tour:abandon` are emitted from inside core's `_doEnd()`
   * *before* it nulls the machine, so a plain `sync()` here latched the last
   * live step and a progress indicator stayed stuck on "2 of 2" forever. These
   * are exactly the values the instance reports one line later.
   */
  const syncIdle = (): void => {
    _isActive.set(false)
    _isPaused.set(false)
    _currentStepId.set(null)
    _currentStepIndex.set(0)
    _totalSteps.set(0)
    _currentStep.set(null)
    _currentContent.set(null)
  }

  let cleanups: Array<() => void> = [
    gf.on('tour:start', () => {
      _isPaused.set(gf.isPaused)
      sync()
    }),
    gf.on('tour:complete', syncIdle),
    gf.on('tour:abandon', syncIdle),
    gf.on('step:enter', sync),
    gf.on('step:exit', sync),
    gf.on('tour:pause', () => _isPaused.set(gf.isPaused)),
    gf.on('tour:resume', () => _isPaused.set(gf.isPaused)),
  ]

  return {
    isActive: toReadable(_isActive),
    isPaused: toReadable(_isPaused),
    currentStepId: toReadable(_currentStepId),
    currentStepIndex: toReadable(_currentStepIndex),
    totalSteps: toReadable(_totalSteps),
    currentStep: toReadable(_currentStep),
    currentContent: toReadable(_currentContent),
    locale: toReadable(_locale),

    start: (flow: FlowDefinition | string, context?: GuidanceContext) => gf.start(flow, context),
    next: () => gf.next(),
    prev: () => gf.prev(),
    goTo: (id: string) => gf.goTo(id),
    send: (event: string) => gf.send(event),
    stop: () => gf.stop(),
    pause: () => gf.pause(),
    resume: () => gf.resume(),
    skip: () => gf.skip(),

    createFlow: (definition: FlowDefinition) => gf.createFlow(definition),
    listFlows: () => gf.listFlows(),
    configure: (patch: Partial<GuideFlowConfig>) => gf.configure(patch),

    hotspot: (target: string | Element, options?: HotspotOptions) => gf.hotspot(target, options),
    removeHotspot: (id: string) => gf.removeHotspot(id),
    hints: (steps: HintStep[]) => gf.hints(steps),
    showHints: () => gf.showHints(),
    hideHints: () => gf.hideHints(),

    i18n: gf.i18n,
    progress: gf.progress,
    setLocale: (next: string): void => {
      gf.i18n.use(next)
      _locale.set(gf.i18n.activeLocale)
    },

    instance: gf,
    ownsInstance: !adopted,

    destroy: (): void => {
      cleanups.forEach((fn) => fn())
      cleanups = []
      // Only dispose what this store created. Destroying a borrowed instance
      // took the host's own listeners, hotspots and styles down with it —
      // AUDIT `svelte-store-destroy-kills-borrowed-instance`.
      if (!adopted) gf.destroy()
    },
  }
}
