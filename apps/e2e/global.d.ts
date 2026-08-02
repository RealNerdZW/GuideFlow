import type { ChecklistController, ChecklistEvent } from '@guideflow/checklist'
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
    /** `stepId:reason` for every `step:waiting`, in order. */
    __gfWaiting: string[]
    /** `stepId:reason` for every `step:timeout`, in order. */
    __gfTimeouts: string[]
    /** The fixture's pushState router — stands in for React Router et al. */
    __gfGo: (view: 'home' | 'settings') => void
    /**
     * The checklist controller, mounted on demand by `#mount-checklist-btn`.
     *
     * On demand rather than at load, because most specs must not have a docked
     * widget on the page and a spec that wants one needs to seed localStorage
     * before the first storage read happens.
     */
    __gfChecklist?: ChecklistController
    /** Set once the checklist controller and widget are both wired. */
    __gfChecklistReady?: boolean
    /** Every `ChecklistEvent`, in order — the analytics seam, observed. */
    __gfChecklistEvents?: ChecklistEvent[]
    /** The mounted widget, so a spec can tear it down. */
    __gfChecklistView?: { destroy(): void }
    /**
     * Install `createTargeting(gf)` on demand.
     *
     * On demand rather than at load, because `install()` auto-starts eligible
     * flows and would fire in the middle of every other spec.
     */
    __gfInstallTargeting: () => Promise<boolean>
    /** The installed targeting engine, once `__gfInstallTargeting` has run. */
    __gfTargeting?: { destroy(): void }
  }
}

export {}
