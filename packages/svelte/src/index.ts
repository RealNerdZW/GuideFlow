/**
 * @guideflow/svelte
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
// @guideflow/svelte — Public API
// ---------------------------------------------------------------------------

// Store
export { createTourStore } from './store.js'
export type { TourStore } from './store.js'

// Actions (`use:` directives)
export { hotspotAction } from './actions.js'
export type { HotspotAction, HotspotActionResult } from './actions.js'

// Re-export core types for convenience
export type {
  FlowDefinition,
  Step,
  StepContent,
  GuidanceContext,
  HotspotOptions,
  HintStep,
  GuideFlowConfig,
  GuideFlowInstance,
  PopoverPlacement,
} from '@guideflow/core'
