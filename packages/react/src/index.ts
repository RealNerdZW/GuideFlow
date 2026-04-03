/**
 * @guideflow/react
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
// @guideflow/react — Public API
// ---------------------------------------------------------------------------

// Context & Provider
export { TourProvider, useGuideFlow } from './context.js'
export type { TourProviderProps } from './context.js'

// Hooks
export { useTour } from './hooks/use-tour.js'
export type { UseTourReturn, TourState } from './hooks/use-tour.js'
export { useTourStep, useHotspot } from './hooks/use-tour-step.js'
export type { UseTourStepReturn, UseHotspotReturn } from './hooks/use-tour-step.js'

// Components
export { TourStep } from './components/TourStep.js'
export type { TourStepProps } from './components/TourStep.js'

export { GuidePopover } from './components/GuidePopover.js'
export type { GuidePopoverProps } from './components/GuidePopover.js'

export { HotspotBeacon } from './components/HotspotBeacon.js'
export type { HotspotBeaconProps } from './components/HotspotBeacon.js'

export { ConversationalPanel } from './components/ConversationalPanel.js'
export type { ConversationalPanelProps, Message } from './components/ConversationalPanel.js'

// Re-export core types for convenience
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
