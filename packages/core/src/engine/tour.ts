// ---------------------------------------------------------------------------
// Tour Engine
// Orchestrates FSM + Spotlight + Renderer + Keyboard + Async step resolution
// ---------------------------------------------------------------------------

import { FlowMachine } from '../fsm/machine.js'
import type {
  FlowDefinition,
  GuidanceContext,
  Step,
  StepContent,
  RendererContract,
  TourEvents,
  SpotlightOptions,
} from '../types/index.js'
import { EventEmitter } from '../utils/emitter.js'
import { isBrowser } from '../utils/ssr.js'

import { scrollTargetIntoView } from './popover.js'
import { SpotlightOverlay } from './spotlight.js'

interface TourEngineOptions<TContext extends GuidanceContext = GuidanceContext> {
  renderer: RendererContract
  spotlight?: SpotlightOptions
  context?: TContext
  debug?: boolean
}

export class TourEngine<TContext extends GuidanceContext = GuidanceContext>
  extends EventEmitter<TourEvents>
{
  private _machine: FlowMachine<TContext> | null = null
  private _spotlight: SpotlightOverlay
  private _renderer: RendererContract
  private _options: TourEngineOptions<TContext>
  private _active = false
  private _flow: FlowDefinition<TContext> | null = null
  private _keyboardHandler: ((e: KeyboardEvent) => void) | null = null
  private _currentStep: Step<TContext> | null = null
  private _currentContent: StepContent | null = null
  /** True when step:exit has already been emitted for the active step (prevents double-emission). */
  private _stepExitEmitted = true
  private _paused = false
  /** Monotonically increasing counter — used to cancel stale async _renderCurrentStep() calls. */
  private _renderGeneration = 0

  constructor(options: TourEngineOptions<TContext>) {
    super()
    this._options = options
    this._renderer = options.renderer
    this._spotlight = new SpotlightOverlay(options.spotlight)

    // Wire overlay backdrop click → tour dismissal
    this._spotlight.setOverlayClickHandler(() => {
      if (this._active) this.skip()
    })
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get isActive(): boolean {
    return this._active
  }

  get currentStepId(): string | null {
    return this._machine?.currentStep?.id ?? null
  }

  get currentStepIndex(): number {
    return this._machine?.stepIndex ?? 0
  }

  get totalSteps(): number {
    return this._machine?.totalSteps ?? 0
  }

  get flowId(): string | null {
    return this._flow?.id ?? null
  }

  /** Expose the internal FSM for snapshot/restore operations. */
  get machine(): FlowMachine<TContext> | null {
    return this._machine
  }

  /**
   * Apply a partial options patch after construction. Used by
   * `GuideFlowInstance.configure()`, which previously mutated only its own
   * config object so `spotlight`, `context` and `debug` never reached the
   * running engine — AUDIT `configure-mostly-ignored`.
   *
   * A `context` patch is merged into the live FSM context too, so `showIf`
   * predicates and transition guards see it immediately.
   */
  setOptions(patch: Partial<Omit<TourEngineOptions<TContext>, 'renderer'>>): void {
    this._options = { ...this._options, ...patch }
    if (patch.context !== undefined) {
      this._machine?.updateContext(patch.context)
    }
  }

  /**
   * Re-render the current step in place. Used after an out-of-band FSM change
   * (snapshot restore, cross-tab sync) so the UI matches the machine.
   */
  async rerender(): Promise<void> {
    if (!this._active || !this._machine) return
    this._renderGeneration++
    await this._renderCurrentStep()
  }

  /** The step that is currently being displayed (set after step:enter, cleared on step:exit). */
  get currentStep(): Step<TContext> | null {
    return this._currentStep
  }

  /** The resolved content for the step that is currently being displayed. */
  get currentContent(): StepContent | null {
    return this._currentContent
  }

  async start(flow: FlowDefinition<TContext>, context?: TContext): Promise<void> {
    if (this._active) this._doEnd(false)

    this._flow = flow
    this._machine = new FlowMachine<TContext>(flow, context ?? this._options.context)
    this._active = true
    // Bump generation to cancel any in-flight render from a previous tour
    this._renderGeneration++

    this.emit('tour:start', { flowId: flow.id })
    this._log('Tour started:', flow.id)

    this._attachKeyboard()
    await this._renderCurrentStep()
  }

  async next(): Promise<void> {
    if (!this._machine || !this._active) return
    this._emitStepExit()

    const advanced = this._machine.nextStep()

    // The tour completes when there is nothing left to render — NOT merely
    // because the machine has entered a state marked `final: true`. A final
    // state that carries steps must display them before the tour ends;
    // checking `isFinal` here is what made the README quick-start silently
    // drop its last step.
    if (!advanced || this._machine.currentStep === null) {
      this._doEnd(true)
      return
    }

    await this._renderCurrentStep()
  }

  async prev(): Promise<void> {
    if (!this._machine || !this._active) return

    // Only leave the current step if we actually moved. Previously prev() at
    // index 0 emitted step:exit and re-rendered the same step, producing a
    // duplicate step:enter and double-counting the step in analytics.
    const moved = this._machine.prevStep()
    if (!moved) return

    this._emitStepExit()
    await this._renderCurrentStep('backward')
  }

  async goTo(stepId: string): Promise<void> {
    if (!this._machine || !this._active) return

    const moved = this._machine.goToStepById(stepId)
    if (!moved) {
      this._log(`goTo("${stepId}"): no such step in this flow`)
      return
    }

    this._emitStepExit()
    await this._renderCurrentStep()
  }

  async send(event: string): Promise<void> {
    if (!this._machine || !this._active) return
    const moved = this._machine.send(event)
    if (!moved) return

    // A successful transition always leaves the current step, so step:exit is
    // owed here too — not only on the terminal path.
    this._emitStepExit()

    // Same rule as next(): end on "nothing left to render", not on isFinal.
    if (this._machine.currentStep === null) {
      this._doEnd(true)
      return
    }
    await this._renderCurrentStep()
  }

  /** The user actively dismissed the tour (Escape, Skip button, backdrop click). */
  skip(): void {
    if (!this._machine || !this._active) return
    this._emitStepExit()
    const step = this._machine.currentStep
    if (step) this.emit('step:skip', { stepId: step.id })
    // Distinguish a user dismissal from a programmatic stop() so hosts can
    // implement "don't show again" — nothing in core used to write dismissal.
    this.emit('tour:dismiss', {
      flowId: this._flow?.id ?? 'unknown',
      stepId: step?.id ?? '',
      stepIndex: this._machine.stepIndex,
    })
    this._doEnd(false)
  }

  end(): void {
    this._doEnd(false)
  }

  /**
   * Pause the current tour — hides the UI without abandoning the flow.
   * Resume with `resume()`.
   */
  pause(): void {
    if (!this._active || this._paused) return
    this._paused = true
    // Cancel any render still awaiting content resolution or the scroll settle,
    // otherwise it lands after the pause and re-shows what we just hid.
    this._renderGeneration++
    this._spotlight.hide()
    this._renderer.hideStep()
    const flowId = this._flow?.id ?? 'unknown'
    const stepId = this._machine?.currentStep?.id ?? ''
    this.emit('tour:pause', { flowId, stepId })
  }

  /** Resume a previously paused tour. */
  resume(): void {
    if (!this._active || !this._paused) return
    this._paused = false
    this._renderGeneration++
    const flowId = this._flow?.id ?? 'unknown'
    const stepId = this._machine?.currentStep?.id ?? ''
    this.emit('tour:resume', { flowId, stepId })
    void this._renderCurrentStep()
  }

  destroy(): void {
    this._doEnd(false)
    this._spotlight.destroy()
    this.removeAllListeners()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _renderCurrentStep(direction: 'forward' | 'backward' = 'forward'): Promise<void> {
    if (!this._machine) return

    // Capture generation so we can detect if a newer render has been started
    const gen = this._renderGeneration

    let step = this._machine.currentStep
    if (!step) return

    // Evaluate showIf — bounded loop using a visited-set to prevent infinite cycles
    // even when the FSM has complex multi-state transitions.
    //
    // The loop must skip in the direction of travel. It always advanced with
    // nextStep(), so pressing Back onto a hidden step bounced the user straight
    // forward again and the Back button appeared dead.
    // See AUDIT `showif-skip-breaks-back-navigation`.
    const visitedStepIds = new Set<string>()
    while (step && step.showIf && !step.showIf(this._machine.context)) {
      if (visitedStepIds.has(step.id)) {
        // Cycle detected — all remaining steps are blocked; end the tour.
        this._doEnd(true)
        return
      }
      visitedStepIds.add(step.id)
      this.emit('step:skip', { stepId: step.id })

      if (direction === 'backward') {
        // Nothing visible behind us: stay put rather than ending the tour —
        // the user asked to go back, not to quit.
        if (!this._machine.prevStep()) return
      } else if (!this._machine.nextStep() || this._machine.currentStep === null) {
        // End on "nothing left to render", not on isFinal — see next().
        this._doEnd(true)
        return
      }
      step = this._machine.currentStep
    }

    if (!step) return

    try {
      // Resolve async content
      const content = await this._resolveContent(step)
      // Abort if a newer render or tour end has superseded this one
      if (gen !== this._renderGeneration) return

      // Find target element
      const target = this._resolveTarget(step)

      // Scroll into view if needed
      if (target && step.scrollIntoView !== false) {
        scrollTargetIntoView(target)
        // Brief delay to let scroll settle before positioning
        await this._sleep(150)
        // Check again after async pause
        if (gen !== this._renderGeneration) return
      }

      // Update spotlight — honour per-step padding override
      if (isBrowser()) {
        this._spotlight.show(target, {
          ...this._options.spotlight,
          ...(step.padding !== undefined && { padding: step.padding }),
        })
        this._spotlight.setClickThrough(step.clickThrough ?? false)
      }

      // Store current step/content so external consumers (e.g. React GuidePopover) can read them
      this._currentStep = step
      this._currentContent = content
      this._stepExitEmitted = false

      // Emit event
      this.emit('step:enter', {
        stepId: step.id,
        stepIndex: this._machine.stepIndex,
        target,
      })

      // Delegate to renderer — cast away TContext since renderer never calls showIf
      this._renderer.renderStep(step as Step, content, this._machine.stepIndex, this._machine.totalSteps)
    } catch (err) {
      // Error boundary — log, emit, and clean up so the page is not left in a broken state
      const flowId = this._flow?.id ?? 'unknown'
      const stepId = step?.id ?? 'unknown'
      this._log('Error rendering step:', stepId, err)
      this.emit('tour:error', { flowId, stepId, error: err })
      this._doEnd(false)
    }
  }

  private async _resolveContent(step: Step<TContext>): Promise<StepContent> {
    if (typeof step.content === 'function') {
      return await step.content()
    }
    return step.content
  }

  private _resolveTarget(step: Step<TContext>): Element | null {
    if (!isBrowser() || step.target == null) return null
    if (step.target instanceof Element) return step.target
    if (typeof step.target === 'string') {
      return document.querySelector(step.target)
    }
    return null
  }

  private _doEnd(completed: boolean): void {
    if (!this._active) return
    this._active = false
    // Bump generation to cancel any in-flight _renderCurrentStep() calls
    this._renderGeneration++

    // Always emit step:exit before ending — guards against double-emission via _stepExitEmitted flag
    this._emitStepExit()

    this._spotlight.hide()
    this._renderer.hideStep()
    this._detachKeyboard()

    const flowId = this._flow?.id ?? 'unknown'
    if (completed) {
      this.emit('tour:complete', { flowId })
    } else {
      const stepId = this._machine?.currentStep?.id ?? ''
      const stepIndex = this._machine?.stepIndex ?? 0
      this.emit('tour:abandon', { flowId, stepId, stepIndex })
    }

    this._currentStep = null
    this._currentContent = null
    this._paused = false
    this._machine = null
    this._flow = null
  }

  private _attachKeyboard(): void {
    if (!isBrowser()) return
    this._detachKeyboard()
    this._keyboardHandler = (e: KeyboardEvent): void => {
      // A paused tour must not respond to the keyboard — arrow keys used to
      // advance it and re-show the UI that pause() had just hidden, and Escape
      // silently abandoned a tour the caller meant to keep.
      if (!this._active || this._paused) return
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault()
          void this.next()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault()
          void this.prev()
          break
        case 'Escape':
          e.preventDefault()
          this.skip()
          break
      }
    }
    document.addEventListener('keydown', this._keyboardHandler)
  }

  private _detachKeyboard(): void {
    if (this._keyboardHandler) {
      document.removeEventListener('keydown', this._keyboardHandler)
      this._keyboardHandler = null
    }
  }

  /** Emit step:exit exactly once per step:enter (idempotent via _stepExitEmitted flag). */
  private _emitStepExit(): void {
    if (this._stepExitEmitted) return
    const step = this._machine?.currentStep
    if (step) {
      this.emit('step:exit', { stepId: step.id, stepIndex: this._machine?.stepIndex ?? 0 })
    }
    this._stepExitEmitted = true
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private _log(...args: unknown[]): void {
    if (this._options.debug) {
      // eslint-disable-next-line no-console
      console.warn('[GuideFlow]', ...args)
    }
  }
}
