/**
 * @guideflow/svelte
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
// createTourStore — Svelte store-based tour API
// ---------------------------------------------------------------------------

import { writable, readable, derived, type Writable, type Readable } from 'svelte/store'
import { createGuideFlow, type GuideFlowConfig, type GuideFlowInstance, type FlowDefinition, type GuidanceContext } from '@guideflow/core'

export interface TourStore {
  /** Whether a tour is currently active */
  isActive: Readable<boolean>
  /** Current step id */
  currentStepId: Readable<string | null>
  /** Current step index (0-based) */
  currentStepIndex: Readable<number>
  /** Total steps in current state */
  totalSteps: Readable<number>
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
  /** Clean up all event listeners */
  destroy: () => void
  /** The underlying GuideFlow instance */
  instance: GuideFlowInstance
}

/**
 * Create a Svelte-friendly tour store.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createTourStore } from '@guideflow/svelte'
 *   const tour = createTourStore({ debug: true })
 * </script>
 *
 * <button on:click={() => tour.start(myFlow)}>Start</button>
 * {#if $tour.isActive}Step {$tour.currentStepIndex + 1}</>
 * ```
 */
export function createTourStore(configOrInstance?: GuideFlowConfig | GuideFlowInstance): TourStore {
  const gf =
    configOrInstance && 'isActive' in configOrInstance
      ? (configOrInstance as GuideFlowInstance)
      : createGuideFlow((configOrInstance ?? {}) as GuideFlowConfig)

  const _isActive: Writable<boolean> = writable(gf.isActive)
  const _currentStepId: Writable<string | null> = writable(gf.currentStepId)
  const _currentStepIndex: Writable<number> = writable(gf.currentStepIndex)
  const _totalSteps: Writable<number> = writable(gf.totalSteps)

  const sync = (): void => {
    _isActive.set(gf.isActive)
    _currentStepId.set(gf.currentStepId)
    _currentStepIndex.set(gf.currentStepIndex)
    _totalSteps.set(gf.totalSteps)
  }

  const cleanups: Array<() => void> = []
  cleanups.push(gf.on('tour:start', sync))
  cleanups.push(gf.on('tour:complete', sync))
  cleanups.push(gf.on('tour:abandon', sync))
  cleanups.push(gf.on('step:enter', sync))
  cleanups.push(gf.on('step:exit', sync))

  return {
    isActive: { subscribe: _isActive.subscribe },
    currentStepId: { subscribe: _currentStepId.subscribe },
    currentStepIndex: { subscribe: _currentStepIndex.subscribe },
    totalSteps: { subscribe: _totalSteps.subscribe },

    start: (flow: FlowDefinition | string, context?: GuidanceContext) =>
      gf.start(flow as FlowDefinition, context),
    next: () => gf.next(),
    prev: () => gf.prev(),
    goTo: (id: string) => gf.goTo(id),
    send: (event: string) => gf.send(event),
    stop: () => gf.stop(),
    /** Clean up all event listeners. Call when the store is no longer needed. */
    destroy: () => {
      cleanups.forEach((fn) => fn())
    },
    instance: gf,
  }
}

// ---------------------------------------------------------------------------
// @guideflow/svelte — Public API
// ---------------------------------------------------------------------------

export type {
  FlowDefinition,
  Step,
  StepContent,
  GuidanceContext,
  HotspotOptions,
  HintStep,
  GuideFlowConfig,
  PopoverPlacement,
} from '@guideflow/core'
