import type { FlowDefinition, GuideFlowInstance } from '@guideflow/core'

declare global {
  interface Window {
    /**
     * The library never sets this — `fixtures/index.html` assigns it, exactly as
     * a real integration must for the devtools extension to detect a tour.
     */
    __guideflow: GuideFlowInstance
    /** Set once the fixture has finished wiring its flows. */
    __gfReady?: boolean
    /** Every `step:enter` id, in order. Reset when a start button is clicked. */
    __gfEnters: string[]
    /** Tour-level event names, in order. Reset when a start button is clicked. */
    __gfEvents: string[]
    /** The flow definitions the fixture exposes, for direct-drive specs. */
    __gfFlows: Record<string, FlowDefinition>
  }
}

export {}
