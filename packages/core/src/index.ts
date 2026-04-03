/**
 * @guideflow/core
 *
 * @author  John Mugabe
 * @email   jonesmugabe@263tickets.co.zw
 * @country Zimbabwe
 * @github  https://github.com/johnmugabe
 * @license MIT
 *
 * Copyright (c) 2026 John Mugabe. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root.
 */

// ---------------------------------------------------------------------------
// @guideflow/core — Main Entry Point
// "Guide users like you know them."
// ---------------------------------------------------------------------------

import type {
  GuideFlowConfig,
  FlowDefinition,
  GuidanceContext,
  HotspotOptions,
  HintStep,
  SpotlightOptions,
  TourEvents,
  FlowSnapshot,
  Step,
  StepContent,
} from './types/index.js'
import { TourEngine } from './engine/tour.js'
import { HotspotManager } from './engine/hotspot.js'
import { HintSystem } from './engine/hint.js'
import { ProgressStore } from './persistence/progress-store.js'
import { BroadcastSync } from './persistence/broadcast-sync.js'
import { I18nRegistry } from './i18n/index.js'
import { DefaultRenderer } from './renderer/default-renderer.js'
import type { EventEmitter } from './utils/emitter.js'
import { createMachine } from './fsm/machine.js'
import { scanAttributeTour } from './compat/intro-compat.js'

// ── Re-exports ─────────────────────────────────────────────────────────────

export type {
  GuideFlowConfig,
  FlowDefinition,
  GuidanceContext,
  Step,
  StepContent,
  StepAction,
  PopoverPlacement,
  SpotlightOptions,
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
export { computePosition, scrollTargetIntoView, getViewportRect } from './engine/popover.js'
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
  start(flow: FlowDefinition<TContext> | string, context?: TContext): Promise<void>
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
  /** Current step id */
  readonly currentStepId: string | null
  /** Current step index (0-based) */
  readonly currentStepIndex: number
  /** Total steps in the current flow state */
  readonly totalSteps: number
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
}

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

  const renderer = (config.renderer ?? new DefaultRenderer()) as DefaultRenderer
  const i18n = new I18nRegistry()
  const progress = new ProgressStore(_config.persistence)
  const hotspots = new HotspotManager(_config.nonce)
  const hints = new HintSystem(_config.nonce)
  const _registeredFlows = new Map<string, FlowDefinition<TContext>>()

  let _broadcastSync: BroadcastSync | null = null

  const engine = new TourEngine<TContext>({
    renderer,
    ...(_config.spotlight !== undefined && { spotlight: _config.spotlight }),
    ...(_config.context !== undefined && { context: _config.context as TContext }),
    ...(_config.debug !== undefined && { debug: _config.debug }),
  })

  // Wire renderer action handler
  if (renderer instanceof DefaultRenderer) {
    renderer.setActionHandler((action) => {
      switch (action) {
        case 'next': void instance.next(); break
        case 'prev': void instance.prev(); break
        case 'skip':
        case 'end': instance.stop(); break
        default: void engine.send(action)
      }
    })
    renderer.onInit(_config)
  }

  // Forward events from independent subsystems (hotspots, hints) to the instance.
  // NOTE: engine === instance (Object.assign target), so self-referential proxies
  // would cause infinite recursion. Only cross-subsystem forwarding is needed here.
  // The tour:complete handler is the exception — it has a persistence side-effect.
  engine.on('tour:complete', ({ flowId }) => {
    if (_config.context?.userId) {
      void progress.markCompleted(_config.context.userId as string, flowId)
    }
  })

  hotspots.on('hotspot:open', (e) => instance.emit('hotspot:open', e))
  hotspots.on('hotspot:close', (e) => instance.emit('hotspot:close', e))
  hints.on('hint:click', (e) => instance.emit('hint:click', e))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance: GuideFlowInstance<TContext> = Object.assign(engine as any, {
    configure(patch: DeepPartialConfig): void {
      _config = { ..._config, ...patch }
      if (patch.nonce !== undefined) {
        // Rebuild sub-systems with new nonce
      }
    },

    createFlow(definition: FlowDefinition<TContext>): FlowDefinition<TContext> {
      _registeredFlows.set(definition.id, definition)
      return definition
    },

    async start(flowOrId: FlowDefinition<TContext> | string, ctx?: TContext): Promise<void> {
      const flow =
        typeof flowOrId === 'string'
          ? _registeredFlows.get(flowOrId) ?? null
          : flowOrId

      if (!flow) {
        console.warn(`[GuideFlow] Flow "${String(flowOrId)}" not found.`)
        return
      }

      // Check persistence — resume or skip if completed
      const userId = _config.context?.userId as string | undefined
      if (userId) {
        const dismissed = await progress.isDismissed(userId, flow.id)
        if (dismissed) return

        const snapshot = await progress.loadSnapshot(userId, flow.id)
        if (snapshot && !snapshot.completed) {
          await engine.start(flow, ctx)
          // Restore exact position
          engine.machine?.restore({ state: snapshot.currentState, stepIndex: snapshot.stepIndex })
          // Sync broadcast
          _broadcastSync = new BroadcastSync(userId)
          _broadcastSync.on('progress:sync', ({ snapshot: snap }) => {
            engine.machine?.restore({ state: snap.currentState, stepIndex: snap.stepIndex })
          })
          return
        }
      }

      await engine.start(flow, ctx)
    },

    stop(): void {
      engine.end()
    },

    async next(): Promise<void> {
      await engine.next()
      await _saveProgress()
    },

    async prev(): Promise<void> {
      await engine.prev()
      await _saveProgress()
    },

    async goTo(stepId: string): Promise<void> {
      await engine.goTo(stepId)
      await _saveProgress()
    },

    async send(event: string): Promise<void> {
      await engine.send(event)
      await _saveProgress()
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
      engine.destroy()
      hotspots.removeAll()
      hints.destroy()
      _broadcastSync?.destroy()
      _broadcastSync = null
    },

    i18n,
    progress,

    get isActive(): boolean { return engine.isActive },
    get currentStepId(): string | null { return engine.currentStepId },
    get currentStepIndex(): number { return engine.currentStepIndex },
    get totalSteps(): number { return engine.totalSteps },
    get currentStep() { return engine.currentStep },
    get currentContent() { return engine.currentContent },
  })

  async function _saveProgress(): Promise<void> {
    const userId = _config.context?.userId as string | undefined
    const flowId = engine.flowId
    if (!userId || !flowId) return

    const machine = engine.machine
    if (!machine) return

    const snapshot: FlowSnapshot = {
      flowId,
      currentState: machine.state,
      stepIndex: machine.stepIndex,
      completed: machine.isFinal,
      timestamp: Date.now(),
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
 * @deprecated Use `getGuideFlow()` instead. This creates a singleton eagerly at import time.
 */
export const guideflow: GuideFlowInstance = new Proxy({} as GuideFlowInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getGuideFlow(), prop, receiver)
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getGuideFlow(), prop, value, receiver)
  },
})

/** Convenience re-export */
export { createMachine as createFlow }

// Attribute-tour auto-init helper
export function autoInit(config?: GuideFlowConfig): void {
  const flow = scanAttributeTour()
  if (!flow) return
  const instance = config ? createGuideFlow(config) : guideflow
  void (instance as GuideFlowInstance).start(flow as FlowDefinition<GuidanceContext>)
}

export default createGuideFlow
