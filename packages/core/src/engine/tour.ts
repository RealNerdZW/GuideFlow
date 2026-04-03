// ---------------------------------------------------------------------------
// Tour Engine
// Orchestrates FSM + Spotlight + Renderer + Keyboard + Async step resolution
// ---------------------------------------------------------------------------

import type {
  FlowDefinition,
  GuidanceContext,
  Step,
  StepContent,
  RendererContract,
  TourEvents,
  SpotlightOptions,
} from '../types/index.js'
import { FlowMachine } from '../fsm/machine.js'
import { SpotlightOverlay } from './spotlight.js'
import { scrollTargetIntoView } from './popover.js'
import { EventEmitter } from '../utils/emitter.js'
import { isBrowser } from '../utils/ssr.js'

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

  constructor(options: TourEngineOptions<TContext>) {
    super()
    this._options = options
    this._renderer = options.renderer
    this._spotlight = new SpotlightOverlay(options.spotlight)
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

    this.emit('tour:start', { flowId: flow.id })
    this._log('Tour started:', flow.id)

    this._attachKeyboard()
    await this._renderCurrentStep()
  }

  async next(): Promise<void> {
    if (!this._machine || !this._active) return
    this._emitStepExit()

    const advanced = this._machine.nextStep()

    if (!advanced || this._machine.isFinal) {
      this._doEnd(true)
      return
    }

    await this._renderCurrentStep()
  }

  async prev(): Promise<void> {
    if (!this._machine || !this._active) return
    this._emitStepExit()
    this._machine.prevStep()
    await this._renderCurrentStep()
  }

  async goTo(stepId: string): Promise<void> {
    if (!this._machine || !this._active) return
    this._machine.goToStepById(stepId)
    await this._renderCurrentStep()
  }

  async send(event: string): Promise<void> {
    if (!this._machine || !this._active) return
    const moved = this._machine.send(event)
    if (!moved) return
    if (this._machine.isFinal) {
      this._emitStepExit()
      this._doEnd(true)
      return
    }
    await this._renderCurrentStep()
  }

  skip(): void {
    if (!this._machine || !this._active) return
    this._emitStepExit()
    const step = this._machine.currentStep
    if (step) this.emit('step:skip', { stepId: step.id })
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

  private async _renderCurrentStep(): Promise<void> {
    if (!this._machine) return

    let step = this._machine.currentStep
    if (!step) return

    // Evaluate showIf — bounded loop to prevent infinite recursion
    const maxSkips = this._machine.totalSteps
    let skipped = 0
    while (step && step.showIf && !step.showIf(this._machine.context)) {
      this.emit('step:skip', { stepId: step.id })
      skipped++
      if (skipped >= maxSkips) {
        // All remaining steps skipped — end tour
        this._doEnd(true)
        return
      }
      const advanced = this._machine.nextStep()
      if (!advanced || this._machine.isFinal) {
        this._doEnd(true)
        return
      }
      step = this._machine.currentStep
    }

    if (!step) return

    // Resolve async content
    const content = await this._resolveContent(step)

    // Find target element
    const target = this._resolveTarget(step)

    // Scroll into view if needed
    if (target && step.scrollIntoView !== false) {
      scrollTargetIntoView(target)
      // Brief delay to let scroll settle before positioning
      await this._sleep(150)
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
      if (!this._active) return
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
