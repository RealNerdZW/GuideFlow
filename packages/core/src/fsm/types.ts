// ---------------------------------------------------------------------------
// FSM Types
// ---------------------------------------------------------------------------

import type { GuidanceContext, FlowDefinition, FlowTransition } from '../types/index.js'

export type { FlowDefinition, FlowTransition }

export interface MachineContext<TContext extends GuidanceContext = GuidanceContext> {
  flow: FlowDefinition<TContext>
  context: TContext
  currentState: string
  stepIndex: number
  history: string[]
}

export type MachineListener<TContext extends GuidanceContext = GuidanceContext> = (
  context: MachineContext<TContext>,
) => void
