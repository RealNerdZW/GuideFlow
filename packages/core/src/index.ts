/**
 * @guideflow/core
 *
 * @author  John Mugabe
 * @country Zimbabwe
 * @github  https://github.com/RealNerdZW
 * @license MIT
 *
 * Copyright (c) 2026 John Mugabe. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

// ---------------------------------------------------------------------------
// @guideflow/core — Main Entry Point
// "Guide users like you know them."
// ---------------------------------------------------------------------------

import { scanAttributeTour } from './compat/intro-compat.js'
import { HintSystem } from './engine/hint.js'
import { HotspotManager } from './engine/hotspot.js'
import { TourEngine } from './engine/tour.js'
import { createMachine } from './fsm/machine.js'
import { I18nRegistry } from './i18n/index.js'
import { BroadcastSync } from './persistence/broadcast-sync.js'
import { ProgressStore } from './persistence/progress-store.js'
import { DefaultRenderer } from './renderer/default-renderer.js'
import type {
  NavigationAdapter,
  SnapshotDiscardReason,
  GuideFlowConfig,
  FlowDefinition,
  GuidanceContext,
  HotspotOptions,
  HintStep,
  TourEvents,
  FlowSnapshot,
  RendererContract,
  StartOptions,
  Step,
  StepContent,
} from './types/index.js'
import type { EventEmitter } from './utils/emitter.js'
import { isBrowser } from './utils/ssr.js'

/**
 * `window` with the devtools detection global.
 *
 * A local intersection rather than a `declare global` augmentation: core is
 * imported by Next, Nuxt and SvelteKit apps, and a global `Window.__guideflow`
 * would leak into every consumer's type space — and collide with the one
 * `apps/e2e/global.d.ts` already declares.
 */
type GlobalWithGuideFlow = Window & { __guideflow?: unknown }

// ── Re-exports ─────────────────────────────────────────────────────────────

export type {
  GuideFlowConfig,
  FlowDefinition,
  GuidanceContext,
  StateNode,
  Step,
  StepContent,
  StepAction,
  RoutePattern,
  TimeoutReason,
  SnapshotDiscardReason,
  FlowTargeting,
  AudienceRule,
  AudienceValue,
  FlowSchedule,
  FlowFrequency,
  StartTrigger,
  NavigationAdapter,
  ResolveTargetRequest,
  ResolveTargetResult,
  PopoverPlacement,
  SpotlightOptions,
  StartOptions,
  HotspotOptions,
  HintStep,
  TourEvents,
  FlowSnapshot,
  RendererContract,
  PersistenceConfig,
  PersistenceDriver,
  DOMContext,
  DOMElementInfo,
  UserEvent,
  IntentSignal,
  GuidedAnswer,
  MaybePromise,
  DeepPartial,
  Prettify,
} from './types/index.js'

export { createMachine } from './fsm/machine.js'
export { FlowMachine } from './fsm/machine.js'
export { SpotlightOverlay } from './engine/spotlight.js'
export { computePosition, scrollTargetIntoView, getViewportRect, getAbsoluteRect } from './engine/popover.js'
export { TourEngine } from './engine/tour.js'
export { HotspotManager } from './engine/hotspot.js'
export { HintSystem } from './engine/hint.js'
export { ProgressStore } from './persistence/progress-store.js'
export { BroadcastSync } from './persistence/broadcast-sync.js'
export { LocalStorageDriver, IndexedDBDriver } from './persistence/drivers.js'
export { I18nRegistry, defaultI18n } from './i18n/index.js'
export { DefaultRenderer } from './renderer/default-renderer.js'
export { scanAttributeTour, watchAttributeTour } from './compat/intro-compat.js'
export { fromTailwind, fromRadix, fromShadcn } from './tokens/index.js'
export { EventEmitter } from './utils/emitter.js'
export { isBrowser } from './utils/ssr.js'
export { injectStyles, removeStyles } from './utils/styles.js'

// ── GuideFlow Instance ─────────────────────────────────────────────────────

export interface GuideFlowInstance<TContext extends GuidanceContext = GuidanceContext>
  extends EventEmitter<TourEvents>
{
  /** Configure the instance (can be called at any time) */
  configure(config: DeepPartialConfig): void
  /** Create a flow definition — alias for createMachine */
  createFlow(definition: FlowDefinition<TContext>): FlowDefinition<TContext>
  /** Start a named or inline flow */
  start(
    flow: FlowDefinition<TContext> | string,
    context?: TContext,
    options?: StartOptions,
  ): Promise<void>
  /** Stop the current tour */
  stop(): void
  /** Go to next step */
  next(): Promise<void>
  /** Go to previous step */
  prev(): Promise<void>
  /** Jump to a step by id */
  goTo(stepId: string): Promise<void>
  /** Send a state machine event */
  send(event: string): Promise<void>
  /** Register a persistent hotspot on an element */
  hotspot(target: string | Element, options?: HotspotOptions): string
  /** Remove a hotspot by id */
  removeHotspot(id: string): void
  /** Register hint markers */
  hints(steps: HintStep[]): void
  /** Show/hide hint badges */
  showHints(): void
  hideHints(): void
  /** i18n API */
  i18n: I18nRegistry
  /** Progress store */
  progress: ProgressStore
  /** Destroy the instance and release all resources */
  destroy(): void
  /** Whether a tour is currently active */
  readonly isActive: boolean
  /** Whether the active tour is paused. `false` once the tour ends. */
  readonly isPaused: boolean
  /**
   * The guidance context predicates see — the running machine's while a tour is
   * live, the configured default otherwise.
   *
   * A prototype getter on `TourEngine`, so it must NOT be added to the
   * `Object.assign` literal.
   */
  readonly context: TContext
  /** Current step id */
  readonly currentStepId: string | null
  /** Current step index (0-based), counted across the whole flow. */
  readonly currentStepIndex: number
  /** Total steps a `next()`-only run of the current flow would show. */
  readonly totalSteps: number
  /**
   * Waiting for a route change, or for a target element to appear.
   *
   * `isActive` stays true and `isPaused` stays false throughout — a wait is not
   * a pause. A prototype getter on `TourEngine`, so it must NOT be added to the
   * `Object.assign` literal below.
   */
  readonly isWaiting: boolean
  /**
   * Re-resolve and re-render the current step against the live DOM.
   *
   * Re-runs `showIf`, re-resolves async `content`, and re-emits `step:enter`.
   * This is the seam `@guideflow/core/navigation` re-anchors through after a
   * route change. Already on the `TourEngine` prototype and never shadowed by
   * the `Object.assign` literal, so declaring it costs zero runtime bytes.
   */
  rerender(): Promise<void>
  /**
   * Id of the running flow, or null when no tour is active.
   *
   * Reachable on the instance because `TourEngine` declares it on the
   * prototype and the `Object.assign` literal does not shadow it — but it was
   * missing from this interface, so TypeScript consumers could not read it even
   * though CLAUDE.md §5.1 listed it as available.
   */
  readonly flowId: string | null
  /** The step currently being displayed (null when no tour is active). */
  readonly currentStep: Step<TContext> | null
  /** Resolved display content for the current step (null when no tour is active). */
  readonly currentContent: StepContent | null
  /** Return all flows registered with createFlow(). */
  listFlows(): FlowDefinition<TContext>[]
  /** Pause the active tour — hides UI without abandoning the flow. */
  pause(): void
  /** Resume a paused tour. */
  resume(): void
  /**
   * Dismiss the tour the way a user would (Escape, the Skip button, a backdrop
   * click): emits `step:skip`, then `tour:dismiss`, then `tour:abandon`.
   *
   * Reachable via the TourEngine prototype — see §5.1 of CLAUDE.md — but it was
   * missing from this interface, so TypeScript users could not call it.
   */
  skip(): void
}

// Shallow partial is intentional here — nested config objects (e.g. renderer,
// spotlight) are replaced wholesale, not merged field-by-field.
type DeepPartialConfig = Partial<GuideFlowConfig>

/**
 * Create a new GuideFlow instance.
 *
 * @example
 * ```ts
 * const guideflow = createGuideFlow({ debug: true })
 * guideflow.start(myFlow)
 * ```
 */
export function createGuideFlow<TContext extends GuidanceContext = GuidanceContext>(
  config: GuideFlowConfig = {},
): GuideFlowInstance<TContext> {
  let _config: GuideFlowConfig = { injectStyles: true, ...config }

  // Typed as the contract, not the concrete class — a user-supplied renderer is
  // a first-class citizen, and the old `as DefaultRenderer` cast hid that the
  // wiring below only ever ran for the built-in one.
  const renderer: RendererContract = config.renderer ?? new DefaultRenderer()
  const i18n = new I18nRegistry()
  const progress = new ProgressStore(_config.persistence)
  const hotspots = new HotspotManager(_config.nonce)
  const hints = new HintSystem(_config.nonce)
  const _registeredFlows = new Map<string, FlowDefinition<TContext>>()

  let _broadcastSync: BroadcastSync | null = null
  let _broadcastUserId: string | null = null
  /** The flow currently running, so lifecycle handlers can read its options. */
  let _activeFlow: FlowDefinition<TContext> | null = null

  const engine = new TourEngine<TContext>({
    renderer,
    ...(_config.spotlight !== undefined && { spotlight: _config.spotlight }),
    ...(_config.context !== undefined && { context: _config.context as TContext }),
    ...(_config.debug !== undefined && { debug: _config.debug }),
    ...(_config.navigation !== undefined && {
      navigation: // Through `unknown`: `Step<T>` is contravariant in T (showIf and the
      // function target form both consume it), so TypeScript will not accept
      // the direct cast even though it is sound — an adapter written against
      // the base GuidanceContext accepts any TContext that extends it, and
      // the adapter only ever reads context.
      _config.navigation as unknown as NavigationAdapter<TContext>,
    }),
  })

  // Wire the renderer. These calls used to sit inside an
  // `instanceof DefaultRenderer` branch, so a user-supplied RendererContract
  // never received its action handler, its config (nonce, injectStyles) or the
  // instance i18n registry — see AUDIT `custom-renderer-oninit-never-called`.
  const _handleAction = (action: string): void => {
    switch (action) {
      case 'next': void instance.next(); break
      case 'prev': void instance.prev(); break
      case 'skip': engine.skip(); break
      case 'end': instance.stop(); break
      default: void instance.send(action)
    }
  }
  if (renderer instanceof DefaultRenderer) {
    renderer.setActionHandler(_handleAction)
    renderer.setI18n(i18n)
  } else {
    renderer.setActionHandler?.(_handleAction)
    renderer.setI18n?.(i18n)
  }
  renderer.onInit?.(_config)

  // Forward events from independent subsystems (hotspots, hints) to the instance.
  // NOTE: engine === instance (Object.assign target), so self-referential proxies
  // would cause infinite recursion. Only cross-subsystem forwarding is needed here.
  // The persistence handlers below are the exception — they have side effects.

  engine.on('tour:complete', ({ flowId }) => {
    const userId = _config.context?.userId
    // Captured before `_activeFlow` is cleared: completion is recorded against
    // the version the user actually finished, so republishing a changed flow
    // reaches them again.
    const completedVersion = _activeFlow?.version
    _activeFlow = null
    if (!userId) return
    void (async () => {
      await progress.markCompleted(userId, flowId, completedVersion)
      // Drop the resume point too. Without this a completed flow left a
      // non-completed snapshot behind and resumed mid-flow on the next visit.
      await progress.clearSnapshot(userId, flowId)
    })()
  })

  // Persist the abandon position. `_doEnd` emits this *before* it nulls the
  // machine, and _saveProgress reads the machine synchronously, so the snapshot
  // is captured correctly. Previously nothing saved on exit at all.
  engine.on('tour:abandon', () => {
    void _saveProgress()
    _activeFlow = null
  })

  // "Don't show again" — opt-in per flow, so closing a tour once does not
  // silently suppress it forever.
  engine.on('tour:dismiss', ({ flowId }) => {
    const userId = _config.context?.userId
    if (!userId || !_activeFlow?.persistDismissal) return
    void progress.markDismissed(userId, flowId)
  })

  // Capture original TourEngine methods BEFORE Object.assign overwrites them.
  // Since instance === engine, assigning new methods onto engine replaces the
  // prototype-inherited ones — any wrapper that calls engine.xxx() would
  // therefore call itself and recurse infinitely without these captures.
  const _engineStart      = engine.start.bind(engine)
  const _engineEnd        = engine.end.bind(engine)
  const _engineNext       = engine.next.bind(engine)
  const _enginePrev       = engine.prev.bind(engine)
  const _engineGoTo       = engine.goTo.bind(engine)
  const _engineSend       = engine.send.bind(engine)
  const _engineDestroy    = engine.destroy.bind(engine)
  const _engineSetOptions = engine.setOptions.bind(engine)
  const _engineRerender   = engine.rerender.bind(engine)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const instance: GuideFlowInstance<TContext> = Object.assign(engine as any, {

    configure(patch: DeepPartialConfig): void {
      const prevNav = _config.navigation
      _config = { ..._config, ...patch }

      // Identity check, not merely `!== undefined`: configure({ navigation })
      // called twice with the SAME adapter must not destroy the one still in
      // use, and called with a different one must not leak the old one's
      // history patch.
      if (patch.navigation !== undefined && patch.navigation !== prevNav) {
        prevNav?.destroy?.()
      }

      if (patch.nonce !== undefined) {
        // Propagate the new nonce to sub-systems so future style injections
        // (hotspots, hints) use the updated value.
        hotspots.setNonce(patch.nonce)
        hints.setNonce(patch.nonce)
      }

      // Push the patch down into the engine. Without this, `spotlight`,
      // `context` and `debug` were consumed once at factory time and every
      // later configure() call was silently ignored.
      _engineSetOptions({
        ...(patch.spotlight !== undefined && { spotlight: patch.spotlight }),
        ...(patch.context !== undefined && { context: patch.context as TContext }),
        ...(patch.debug !== undefined && { debug: patch.debug }),
        ...(patch.navigation !== undefined && {
          navigation: patch.navigation as unknown as NavigationAdapter<TContext>,
        }),
      })

      if (patch.persistence !== undefined) {
        progress.reconfigure(patch.persistence)
      }

      if (patch.renderer !== undefined && patch.renderer !== renderer) {
        console.warn('[GuideFlow] configure({ renderer }) is ignored — set it in createGuideFlow().')
      }

      // Not a factory-only key. The whole security argument for `exposeGlobal`
      // is that the developer stays in control of it, so
      // `configure({ exposeGlobal: false })` has to be a real kill switch
      // rather than the silent no-op that AUDIT `configure-mostly-ignored`
      // is about — three lines below the warn that exists for that class.
      if (patch.exposeGlobal !== undefined) _setGlobal(patch.exposeGlobal)

      // Let the renderer pick up nonce / injectStyles / theming changes.
      renderer.onInit?.(_config)
    },

    createFlow(definition: FlowDefinition<TContext>): FlowDefinition<TContext> {
      _registeredFlows.set(definition.id, definition)
      return definition
    },

    async start(
      flowOrId: FlowDefinition<TContext> | string,
      ctx?: TContext,
      options?: StartOptions,
    ): Promise<void> {
      const flow =
        typeof flowOrId === 'string'
          ? _registeredFlows.get(flowOrId) ?? null
          : flowOrId

      if (!flow) {
        console.warn(`[GuideFlow] Flow "${String(flowOrId)}" not found.`)
        return
      }

      const userId = _config.context?.userId
      let restorePoint:
        | { state: string; stepIndex: number; stepId?: string }
        | null = null

      if (userId) {
        // Suppress flows the user has dismissed or already finished. The
        // completed check was missing entirely, so `markCompleted` was
        // write-only and every tour replayed on every visit.
        // `force` skips both, and writes nothing. It exists because the two
        // alternatives are worse: leaving them is a tour that silently does not
        // start (no render, no event — see `StartOptions`), and clearing the
        // records first is destructive in a way nobody would predict, because
        // `@guideflow/checklist` projects `getCompletedFlows()` and would
        // visibly un-tick.
        if (options?.force !== true) {
          if (await progress.isDismissed(userId, flow.id)) return
          // Version-scoped: finishing v1 must not suppress v2. A record written
          // without a version still suppresses every version — see isCompleted.
          if (await progress.isCompleted(userId, flow.id, flow.version)) return
        }

        const snapshot = await progress.loadSnapshot(userId, flow.id)
        if (snapshot && !snapshot.completed) {
          // `?? null` on both sides deliberately: a snapshot written before the
          // flow declared a version, and a flow that has since dropped one, are
          // both mismatches. Resuming across a structural change is the whole
          // thing this gate exists to prevent.
          if ((snapshot.version ?? null) === (flow.version ?? null)) {
            restorePoint = {
              state: snapshot.currentState,
              stepIndex: snapshot.stepIndex,
              ...(snapshot.stepId !== undefined && { stepId: snapshot.stepId }),
            }
          } else {
            await _discardSnapshot(userId, flow.id, 'version')
          }
        }

        // Cross-tab sync belongs to the instance, not to the resume path — it
        // used to be created only when resuming, so a fresh tour published
        // nothing and every resume leaked another channel.
        _ensureBroadcastSync(userId)
      }

      _activeFlow = flow
      await _engineStart(flow, ctx)

      // Restoring must be followed by a re-render: _engineStart has already
      // painted step 0, and FlowMachine.restore only moves the machine.
      if (restorePoint) {
        if (engine.machine?.restore(restorePoint) === true) {
          await _engineRerender()
        } else if (userId) {
          // The version matched but the position did not survive — a renamed
          // state, or a step id that no longer exists. Same outcome, different
          // reason, and the caller deserves to know which.
          await _discardSnapshot(userId, flow.id, 'structure')
        }
      }

      // Persist immediately so abandoning on the very first step is remembered.
      await _saveProgress()
    },

    stop(): void {
      _engineEnd()
    },

    // Each of these snapshots the moment the MACHINE moves, not when the
    // render lands. The engine runs synchronously through the FSM before its
    // first await, so the new position is already committed by the time the
    // promise is returned — and with a navigation adapter the render can wait
    // seconds for a route, during which a closed tab would have lost the
    // advance entirely.
    //
    // The `finally` is load-bearing: without it a throwing _saveProgress leaves
    // `render` as an unhandled rejection.
    async next(): Promise<void> {
      const render = _engineNext()
      try {
        await _saveProgress()
      } finally {
        await render
      }
    },

    async prev(): Promise<void> {
      const render = _enginePrev()
      try {
        await _saveProgress()
      } finally {
        await render
      }
    },

    async goTo(stepId: string): Promise<void> {
      const render = _engineGoTo(stepId)
      try {
        await _saveProgress()
      } finally {
        await render
      }
    },

    async send(event: string): Promise<void> {
      const render = _engineSend(event)
      try {
        await _saveProgress()
      } finally {
        await render
      }
    },

    hotspot(target: string | Element, options?: HotspotOptions): string {
      return hotspots.add(target, options)
    },

    removeHotspot(id: string): void {
      hotspots.remove(id)
    },

    hints(steps: HintStep[]): void {
      hints.register(steps)
    },

    showHints(): void { hints.show() },
    hideHints(): void { hints.hide() },

    listFlows(): FlowDefinition<TContext>[] {
      return Array.from(_registeredFlows.values())
    },

    destroy(): void {
      _engineDestroy()
      hotspots.removeAll()
      hints.destroy()
      _broadcastSync?.destroy()
      _broadcastSync = null
      _broadcastUserId = null
      _activeFlow = null
      _setGlobal(false)
    },

    i18n,
    progress,
  })
  // instance === engine, so TourEngine's prototype getters (isActive,
  // currentStepId, etc.) are already reachable — no extra wiring needed.

  /**
   * Register or unregister this instance on `window.__guideflow`.
   *
   * Called from three places: the factory below, `configure()` and `destroy()`.
   * The unregister path is identity-guarded — two instances that both opted in
   * leave the *last* one on the global, and an unconditional delete in the
   * first's teardown would unregister whichever is actually live.
   */
  function _setGlobal(on: boolean): void {
    if (!isBrowser()) return
    const w = window as GlobalWithGuideFlow
    if (on) w.__guideflow = instance
    else if (w.__guideflow === instance) delete w.__guideflow
  }

  // Opt-in detection for the devtools extension. Assigned after the
  // `Object.assign`, because that is what produces the object the extension
  // needs to read — `engine` alone is missing `start`, `next`, `listFlows` and
  // every other wrapper the panel dispatches to.
  if (_config.exposeGlobal === true) _setGlobal(true)

  /**
   * Create the cross-tab channel once per instance (recreating it only if the
   * user identity changes), and ignore snapshots belonging to a different flow.
   */
  function _ensureBroadcastSync(userId: string): void {
    if (_broadcastSync && _broadcastUserId === userId) return

    _broadcastSync?.destroy()
    _broadcastUserId = userId
    _broadcastSync = new BroadcastSync(userId)
    _broadcastSync.on('progress:sync', ({ snapshot: snap }) => {
      if (snap.flowId !== engine.flowId) return
      // The version must match too. This used to reason "both tabs are the same
      // build, so a mismatch is impossible by construction" — true only while
      // flows ship inside the bundle. A flow fetched at runtime breaks it: two
      // tabs of the same build can hold different revisions, and restoring one
      // tab's position into the other's machine clamps a legacy snapshot into a
      // different index space.
      if ((snap.version ?? null) !== (_activeFlow?.version ?? null)) return
      if (engine.machine?.restore({
        state: snap.currentState,
        stepIndex: snap.stepIndex,
        ...(snap.stepId !== undefined && { stepId: snap.stepId }),
      }) === true) {
        void _engineRerender()
      }
    })
  }

  /**
   * Throw away a resume point that can no longer be honoured, and say so.
   *
   * The alternative — resuming anyway — puts the user at a coordinate that
   * means something different than it did when it was written, which is worse
   * than restarting and much harder to diagnose.
   */
  async function _discardSnapshot(
    userId: string,
    flowId: string,
    reason: SnapshotDiscardReason,
  ): Promise<void> {
    await progress.clearSnapshot(userId, flowId)
    engine.emit('progress:discard', { flowId, reason })
  }

  async function _saveProgress(): Promise<void> {
    const userId = _config.context?.userId
    const flowId = engine.flowId
    if (!userId || !flowId) return

    const machine = engine.machine
    if (!machine) return

    const snapshot: FlowSnapshot = {
      flowId,
      currentState: machine.state,
      stepIndex: machine.stepIndex,
      // Always false: this only runs while a tour is live, so by definition it
      // has not completed. It used to store `machine.isFinal`, which is true
      // for the *whole* of a `final: true` state — now that such states render
      // their steps, that marked every mid-flow save as complete and made the
      // tour un-resumable.
      completed: false,
      timestamp: Date.now(),
      // `engine.currentStepId` reads the same machine position as
      // `machine.stepIndex` above — not the post-render `_currentStep` — so the
      // two can never disagree.
      ...(engine.currentStepId !== null && { stepId: engine.currentStepId }),
      ...(_activeFlow?.version !== undefined && { version: _activeFlow.version }),
    }
    await progress.saveSnapshot(userId, snapshot)
    _broadcastSync?.broadcast({ type: 'snapshot', flowId, snapshot })
  }

  return instance
}

/**
 * Default singleton — for script-tag / CDN usage.
 * Lazily created on first access to avoid side effects at import time.
 */
let _singleton: GuideFlowInstance | null = null
export function getGuideFlow(): GuideFlowInstance {
  if (!_singleton) _singleton = createGuideFlow()
  return _singleton
}

/**
 * @deprecated Use `getGuideFlow()` instead.
 * Note: despite the deprecation message, this does NOT create a singleton at
 * import time — it is backed by a lazy Proxy that calls `getGuideFlow()` on
 * first property access.
 */
export const guideflow: GuideFlowInstance = new Proxy({} as GuideFlowInstance, {
  get(_target, prop, receiver) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Reflect.get(getGuideFlow(), prop, receiver)
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getGuideFlow(), prop, value, receiver)
  },
})

/**
 * Re-export of createMachine under an alias.
 * NOTE: This is a low-level factory that returns a FlowMachine.
 * It is intentionally named differently to `GuideFlowInstance.createFlow()`
 * which registers a FlowDefinition on an instance.
 * @deprecated Prefer `createMachine` or `createFlowMachine` directly.
 */
export { createMachine as createFlowMachine }
// Keep the original `createFlow` alias for backward-compatibility.
export { createMachine as createFlow }

// Attribute-tour auto-init helper
export function autoInit(config?: GuideFlowConfig): void {
  const flow = scanAttributeTour()
  if (!flow) return
  const instance = config ? createGuideFlow(config) : guideflow
  void (instance).start(flow)
}

export default createGuideFlow
