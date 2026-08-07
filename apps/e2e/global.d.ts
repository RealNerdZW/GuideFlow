import type { ChecklistController, ChecklistEvent } from '@guideflow/checklist'
import type { FlowDefinition, GuideFlowInstance } from '@guideflow/core'

declare global {
  interface Window {
    /**
     * Set by `createGuideFlow({ exposeGlobal: true })` in `fixtures/index.html`,
     * exactly as a real integration opts in for the devtools extension to detect
     * a tour. It used to be a hand-written assignment, because the library had
     * no way to do it.
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
     * Mount `@guideflow/banner` on demand, for the same reason as the
     * checklist: most specs must not have a docked surface on the page.
     */
    __gfMountBanners: (definitions: unknown[], options?: unknown) => Promise<boolean>
    /** The banner controller, once `__gfMountBanners` has run. */
    __gfBanners?: { destroy(): void }
    /** The mounted bar, so a spec can tear it down. */
    __gfBannerView?: { destroy(): void }
    /** Every `BannerEvent`, in order — the analytics seam, observed. */
    __gfBannerEvents?: Array<{ type: string; bannerId: string }>
    /** Mount `@guideflow/survey` on demand. */
    __gfMountSurveys: (definitions: unknown[], options?: unknown) => Promise<boolean>
    /** The survey controller, once `__gfMountSurveys` has run. */
    __gfSurveys?: { destroy(): void }
    /** The mounted card, so a spec can tear it down. */
    __gfSurveyView?: { destroy(): void }
    /** Every `SurveyEvent`, in order — the answers seam, observed. */
    __gfSurveyEvents?: Array<{ type: string; surveyId: string; score?: number; comment?: string }>
    /**
     * Install `createTargeting(gf)` on demand.
     *
     * On demand rather than at load, because `install()` auto-starts eligible
     * flows and would fire in the middle of every other spec.
     */
    __gfInstallTargeting: () => Promise<boolean>
    /** The installed targeting engine, once `__gfInstallTargeting` has run. */
    __gfTargeting?: { destroy(): void }
    /** Every live-region utterance, in order — see a11y-announcements.spec.ts. */
    __gfSaid?: Array<{
      source: string
      text: string
      at: number
      politeness: string | null
      role: string | null
    }>
    /** Timestamp of the first utterance, so `at` is relative to it. */
    __gfT0?: number | null
  }
}

export {}
