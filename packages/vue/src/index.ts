// ---------------------------------------------------------------------------
// @guideflow/vue — Public API
// ---------------------------------------------------------------------------

// Plugin
export { GuideFlowPlugin, useGuideFlow, GUIDEFLOW_KEY } from './plugin.js'
export type { GuideFlowPluginOptions } from './plugin.js'

// Composables
export { useTour } from './composables/use-tour.js'
export type { UseTourReturn } from './composables/use-tour.js'

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
  GuideFlowInstance,
} from '@guideflow/core'
