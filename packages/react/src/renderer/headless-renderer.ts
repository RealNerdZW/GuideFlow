// ---------------------------------------------------------------------------
// Headless renderer — a RendererContract that draws nothing
//
// Core's DefaultRenderer owns a `div.gf-popover` it appends to document.body.
// That is the right default, but it means a React component that also draws a
// popover produces two stacked `aria-modal` dialogs (AUDIT
// `react-guidepopover-duplicates-core-renderer`).
//
// This implementation satisfies the same contract by pushing the step into a
// tiny observable store instead of into the DOM, so <GuidePopover> — or any
// component you write yourself — can be the only thing on screen. The spotlight
// overlay is owned by the engine, not by the renderer, so it keeps working.
// ---------------------------------------------------------------------------

import type {
  GuideFlowConfig,
  HintStep,
  I18nRegistry,
  RendererContract,
  Step,
  StepContent,
} from '@guideflow/core'

/**
 * `RegisteredHotspot` is referenced by `RendererContract` but is not exported
 * from `@guideflow/core`'s public API, so it is recovered from the contract
 * itself rather than by widening the parameter to `unknown`.
 */
type RegisteredHotspot = Parameters<RendererContract['renderHotspot']>[0]

/** Everything core hands the renderer for the step currently on screen. */
export interface HeadlessStepState {
  readonly step: Step
  readonly content: StepContent
  readonly index: number
  readonly total: number
}

/**
 * A `RendererContract` whose render calls become React state.
 *
 * Pass one to `createGuideFlow({ renderer })` — or let
 * `<TourProvider renderer="react">` do it for you — and mount a component that
 * reads it. `subscribe` / `getSnapshot` / `getServerSnapshot` are shaped for
 * `useSyncExternalStore` and are pre-bound, so they can be passed directly.
 */
export interface HeadlessRenderer extends RendererContract {
  subscribe: (listener: () => void) => () => void
  /** The active step, or `null` when no step is on screen (including while paused). */
  getSnapshot: () => HeadlessStepState | null
  getServerSnapshot: () => null
  /**
   * Run a step action through core's own handler: `next`, `prev`, `skip` and
   * `end` are special-cased exactly as they are for the default renderer, and
   * anything else is sent to the state machine as an FSM event.
   */
  dispatch: (action: string) => void
  /** The instance's translation registry, once core has wired it up. */
  readonly i18n: I18nRegistry | null
  /** The config core last pushed in via `onInit`. */
  readonly config: GuideFlowConfig | null
}

class ReactHeadlessRenderer implements HeadlessRenderer {
  private _state: HeadlessStepState | null = null
  private readonly _listeners = new Set<() => void>()
  private _onAction: ((action: string) => void) | null = null
  private _i18n: I18nRegistry | null = null
  private _config: GuideFlowConfig | null = null

  // ── Store surface (bound — handed straight to useSyncExternalStore) ───────

  subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener)
    return () => {
      this._listeners.delete(listener)
    }
  }

  getSnapshot = (): HeadlessStepState | null => this._state

  getServerSnapshot = (): null => null

  get i18n(): I18nRegistry | null {
    return this._i18n
  }

  get config(): GuideFlowConfig | null {
    return this._config
  }

  dispatch = (action: string): void => {
    if (!this._onAction) {
      console.warn(
        '[GuideFlow] Headless renderer: no action handler is wired yet. ' +
          'Pass this renderer to createGuideFlow({ renderer }) before using it.',
      )
      return
    }
    this._onAction(action)
  }

  // ── RendererContract ─────────────────────────────────────────────────────

  renderStep(step: Step, content: StepContent, index: number, total: number): void {
    this._state = { step, content, index, total }
    this._emit()
  }

  hideStep(): void {
    if (this._state === null) return
    this._state = null
    this._emit()
  }

  renderHotspot(_hotspot: RegisteredHotspot): void {
    /* HotspotManager draws its own beacons — nothing to mirror into React. */
  }

  destroyHotspot(_id: string): void {
    /* See renderHotspot. */
  }

  renderHint(_hint: HintStep): void {
    /* HintSystem draws its own badges. */
  }

  destroyHints(): void {
    /* See renderHint. */
  }

  onInit(config: GuideFlowConfig): void {
    // Deliberately does not inject any CSS: React components ship no stylesheet
    // here, so consumers import `@guideflow/core/styles` (or their own) exactly
    // as they already must for the default renderer.
    this._config = config
  }

  setI18n(i18n: I18nRegistry): void {
    this._i18n = i18n
    this._emit()
  }

  setActionHandler(handler: (action: string) => void): void {
    this._onAction = handler
  }

  private _emit(): void {
    this._listeners.forEach((listener) => listener())
  }
}

/**
 * Create a renderer that reports steps to React instead of drawing them.
 *
 * @example
 * ```tsx
 * const renderer = createHeadlessRenderer()
 * const gf = createGuideFlow({ renderer })
 *
 * <TourProvider instance={gf} renderer={renderer}>
 *   <App />
 *   <GuidePopover />
 * </TourProvider>
 * ```
 */
export function createHeadlessRenderer(): HeadlessRenderer {
  return new ReactHeadlessRenderer()
}
