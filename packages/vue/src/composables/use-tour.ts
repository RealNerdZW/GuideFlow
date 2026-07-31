// ---------------------------------------------------------------------------
// useTour — Vue 3 composable for controlling a GuideFlow tour
// ---------------------------------------------------------------------------

import type {
  FlowDefinition,
  GuidanceContext,
  GuideFlowConfig,
  GuideFlowInstance,
  HintStep,
  HotspotOptions,
  I18nRegistry,
  ProgressStore,
  Step,
  StepContent,
} from '@guideflow/core'
import { computed, onScopeDispose, readonly, ref, shallowRef, type Ref } from 'vue'

import { useGuideFlow } from '../plugin.js'

export interface UseTourReturn {
  // ── Reactive state ────────────────────────────────────────────────────────
  isActive: Readonly<Ref<boolean>>
  /** Whether the active tour is paused. Mirrors `instance.isPaused`. */
  isPaused: Readonly<Ref<boolean>>
  currentStepId: Readonly<Ref<string | null>>
  currentStepIndex: Readonly<Ref<number>>
  totalSteps: Readonly<Ref<number>>
  /** The step object currently on screen — `null` when no tour is running. */
  currentStep: Readonly<Ref<Step | null>>
  /** The resolved content for that step (async `content` already awaited). */
  currentContent: Readonly<Ref<StepContent | null>>
  /** Active i18n locale. Only tracks changes made through `setLocale()`. */
  locale: Readonly<Ref<string>>

  // ── Navigation ────────────────────────────────────────────────────────────
  start: (flow?: FlowDefinition | string, context?: GuidanceContext) => Promise<void>
  next: () => Promise<void>
  prev: () => Promise<void>
  goTo: (stepId: string) => Promise<void>
  send: (event: string) => Promise<void>
  stop: () => void
  /** Hide the tour UI without abandoning the flow. */
  pause: () => void
  /** Re-show a paused tour at the step it was paused on. */
  resume: () => void
  /** Dismiss the tour the way a user would — emits `step:skip`, `tour:dismiss`, `tour:abandon`. */
  skip: () => void

  // ── Flows & configuration ─────────────────────────────────────────────────
  createFlow: (definition: FlowDefinition) => FlowDefinition
  listFlows: () => FlowDefinition[]
  configure: (patch: Partial<GuideFlowConfig>) => void

  // ── Standalone UI ─────────────────────────────────────────────────────────
  hotspot: (target: string | Element, options?: HotspotOptions) => string
  removeHotspot: (id: string) => void
  hints: (steps: HintStep[]) => void
  showHints: () => void
  hideHints: () => void

  // ── Subsystems ────────────────────────────────────────────────────────────
  i18n: I18nRegistry
  progress: ProgressStore
  /** Switch locale and update the reactive `locale` ref in one call. */
  setLocale: (locale: string) => void

  /** The raw instance — escape hatch for `on()` and anything not projected. */
  instance: GuideFlowInstance
}

/**
 * Vue composable for tour control.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useTour } from '@guideflow/vue'
 * const tour = useTour()
 * </script>
 * <template>
 *   <button @click="tour.start(myFlow)">Start Tour</button>
 * </template>
 * ```
 */
export function useTour(flowId?: string): UseTourReturn {
  const gf = useGuideFlow()

  const isActive = ref(gf.isActive)
  // Seeded from the instance, not `false`: a component that mounts while a tour
  // is already paused has no `tour:pause` event left to observe.
  const isPaused = ref(gf.isPaused)
  const currentStepId = ref(gf.currentStepId)
  const currentStepIndex = ref(gf.currentStepIndex)
  const totalSteps = ref(gf.totalSteps)
  // shallowRef: a Step carries functions (`showIf`, action handlers) and a
  // resolved `target`; `ref()` would deep-proxy all of it for no benefit.
  const currentStep = shallowRef<Step | null>(gf.currentStep)
  const currentContent = shallowRef<StepContent | null>(gf.currentContent)
  const locale = ref(gf.i18n.activeLocale)

  const syncState = (): void => {
    isActive.value = gf.isActive
    currentStepId.value = gf.currentStepId
    currentStepIndex.value = gf.currentStepIndex
    totalSteps.value = gf.totalSteps
    currentStep.value = gf.currentStep
    currentContent.value = gf.currentContent
  }

  /**
   * Reset to the idle values instead of reading them back off the instance.
   *
   * `tour:complete` / `tour:abandon` are emitted from inside `_doEnd()` *before*
   * it nulls the machine, so a plain `syncState()` here latched the last live
   * step and a progress indicator stayed stuck on "2 of 2" forever. These are
   * exactly the values the instance reports one line later.
   */
  const syncIdle = (): void => {
    isActive.value = false
    isPaused.value = false
    currentStepId.value = null
    currentStepIndex.value = 0
    totalSteps.value = 0
    currentStep.value = null
    currentContent.value = null
  }

  const cleanups: Array<() => void> = [
    gf.on('tour:start', () => {
      isPaused.value = gf.isPaused
      syncState()
    }),
    gf.on('tour:complete', syncIdle),
    gf.on('tour:abandon', syncIdle),
    gf.on('step:enter', syncState),
    gf.on('step:exit', syncState),
    gf.on('tour:pause', () => { isPaused.value = gf.isPaused }),
    gf.on('tour:resume', () => { isPaused.value = gf.isPaused }),
  ]

  // onScopeDispose, not onUnmounted: onUnmounted requires a component instance,
  // so calling useTour() from a bare effectScope() — a Pinia store, or any
  // shared composable — registered no teardown at all and leaked all the core
  // listeners for the lifetime of the page. A component's setup() runs inside
  // its own effect scope, so this covers the component case too.
  onScopeDispose(() => {
    cleanups.forEach((fn) => fn())
  })

  return {
    isActive: readonly(isActive),
    isPaused: readonly(isPaused),
    currentStepId: readonly(currentStepId),
    currentStepIndex: readonly(currentStepIndex),
    totalSteps: readonly(totalSteps),
    // computed(), not readonly(): readonly() hands back a *deep* readonly proxy,
    // which would wrap the step's own functions and break identity comparisons
    // against `instance.currentStep`. A computed ref is read-only by
    // construction and passes the raw object straight through.
    currentStep: computed(() => currentStep.value),
    currentContent: computed(() => currentContent.value),
    locale: readonly(locale),

    start: async (flow?: FlowDefinition | string, context?: GuidanceContext): Promise<void> => {
      const target = flow ?? flowId
      if (!target) return
      await gf.start(target, context)
    },

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
      locale.value = gf.i18n.activeLocale
    },

    instance: gf,
  }
}
