// ---------------------------------------------------------------------------
// Tour Engine
// Orchestrates FSM + Spotlight + Renderer + Keyboard + Async step resolution
// ---------------------------------------------------------------------------

import { FlowMachine } from '../fsm/machine.js'
import type { I18nRegistry } from '../i18n/index.js'
import type {
  FlowDefinition,
  GuidanceContext,
  NavigationAdapter,
  ResolveTargetResult,
  Step,
  StepContent,
  RendererContract,
  TimeoutReason,
  TourEvents,
  SpotlightOptions,
  StateNode,
} from '../types/index.js'
import { EventEmitter } from '../utils/emitter.js'
import { interpolate } from '../utils/interpolate.js'
import { isBrowser } from '../utils/ssr.js'

import { scrollTargetIntoView } from './popover.js'
import { SpotlightOverlay } from './spotlight.js'

/**
 * Elements whose own keyboard handling must never be pre-empted.
 *
 * `input` and `textarea` need arrow keys for the caret; `select` and the
 * listbox/slider/spinbutton/menu roles use them to change value or move
 * selection; `contenteditable` is a text surface by definition.
 */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const EDITABLE_ROLES = new Set([
  'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton',
  'menu', 'menubar', 'menuitem', 'tree', 'grid', 'application',
])

/** True when a keystroke on this target belongs to the page, not to the tour. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (EDITABLE_TAGS.has(target.tagName)) return true
  if (target.closest('[contenteditable]:not([contenteditable="false"])') !== null) return true

  const role = target.getAttribute('role')
  if (role !== null && EDITABLE_ROLES.has(role)) return true
  // A composite widget can put focus on a descendant of the roled container.
  return target.closest('[role="listbox"],[role="grid"],[role="tree"],[role="menu"]') !== null
}

interface TourEngineOptions<TContext extends GuidanceContext = GuidanceContext> {
  renderer: RendererContract
  navigation?: NavigationAdapter<TContext>
  spotlight?: SpotlightOptions
  context?: TContext
  debug?: boolean
  /**
   * The instance registry, for per-locale step content and chapter labels.
   *
   * The engine needs it because content is resolved BEFORE `renderStep` — a
   * custom `RendererContract` must receive finished content, and core never
   * assumes the default renderer.
   */
  i18n?: I18nRegistry
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
  private _waiting: TimeoutReason | null = null
  /** The element the current step is anchored to — read by the re-anchor check. */
  private _anchoredTo: Element | null = null
  private _navOff: (() => void) | null = null
  /** Aborts the in-flight render's waiter. Paired with every generation bump. */
  private _renderAbort: AbortController | null = null
  /**
   * Monotonically increasing counter — used to cancel stale async
   * _renderCurrentStep() calls.
   *
   * **Every entry point that starts a render must bump this first.** It used to
   * be bumped only by rerender/start/pause/resume/_doEnd, so two next() calls
   * inside the 150 ms settle — a double-click on Next, or keyboard autorepeat —
   * captured the SAME generation, both passed every check, and the older render
   * could land last (AUDIT `generation-not-bumped-on-navigation`). Harmless at
   * 150 ms; not harmless once a step can wait seconds for a route to arrive.
   */
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

  /**
   * Whether the active tour is paused. Reset to `false` when the tour ends, so
   * a paused tour that is stopped reports `false`, not a stale `true`.
   */
  get isPaused(): boolean {
    return this._paused
  }

  /**
   * Waiting for a route change, or for a target element to appear.
   *
   * `isActive` stays true and `isPaused` stays false — deliberately a separate
   * flag rather than reusing `_paused`, which would break three ways:
   * `pause()` early-returns when it is already true, so a host pausing during a
   * wait would be a silent no-op; `resume()` would clear the internal wait and
   * start a *second* waiter; and the keyboard handler gates on it, which would
   * kill Escape exactly when the user most wants out.
   */
  get isWaiting(): boolean {
    return this._waiting !== null
  }

  get currentStepId(): string | null {
    return this._machine?.currentStep?.id ?? null
  }

  /**
   * Position in the whole flow, not in the current state.
   *
   * These used to report the current state's numbers, so a multi-state tour
   * counted 1-of-1 in each state and the renderer offered "Done" on the first
   * step — AUDIT `total-steps-is-per-state`.
   */
  get currentStepIndex(): number {
    return this._machine?.flowStepIndex ?? 0
  }

  get totalSteps(): number {
    return this._machine?.flowTotalSteps ?? 0
  }

  get flowId(): string | null {
    return this._flow?.id ?? null
  }

  /** Expose the internal FSM for snapshot/restore operations. */
  /**
   * The guidance context predicates see.
   *
   * The running machine's context while a tour is live, and the configured
   * default otherwise — so a caller can read `context.userId` without having to
   * start a tour first. `@guideflow/core/targeting` needs exactly that to
   * evaluate audience rules before anything has started.
   */
  get context(): TContext {
    return this._machine?.context ?? (this._options.context ?? ({} as TContext))
  }

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
    this._attachNavigation()
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

    this._renderGeneration++
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
    this._renderGeneration++
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
    this._renderGeneration++
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
    this._renderGeneration++
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
    // Cancel an in-flight wait: a paused tour must not keep polling for a
    // target, and must not paint when one finally appears.
    this._renderAbort?.abort()
    this._exitWaiting()
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
    // Here, not in _doEnd(): that early-returns on `!this._active`, so an
    // engine destroyed without ever starting a tour would leak the adapter's
    // history patch.
    this._options.navigation?.destroy?.()
    this._spotlight.destroy()
    this.removeAllListeners()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _renderCurrentStep(direction: 'forward' | 'backward' = 'forward'): Promise<void> {
    if (!this._machine) return

    // Capture generation so we can detect if a newer render has been started.
    // The controller travels with it: a navigation adapter can wait seconds,
    // and a superseded wait has to be cancelled, not merely ignored on return.
    const gen = this._renderGeneration
    this._renderAbort?.abort()
    const ac = new AbortController()
    this._renderAbort = ac

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

      // ── Target resolution ──────────────────────────────────────────────
      // Without an adapter this is one querySelector, exactly as before. With
      // one it can wait — for a route to arrive, for a lazy chunk to mount, for
      // a drawer to open — so every branch below ends in a generation check.
      const resolved = step
      let target: Element | null
      const nav = this._options.navigation

      if (nav && isBrowser()) {
        let waited = false
        let res: ResolveTargetResult
        try {
          res = await nav.resolveTarget({
            step: resolved,
            state: this._machine.currentStateNode ?? ({} as StateNode<TContext>),
            context: this._machine.context,
            direction,
            signal: ac.signal,
            onWaiting: (reason) => {
              waited = true
              this._enterWaiting(reason, resolved as Step)
            },
          })
        } catch (e) {
          // A third-party adapter must not be able to kill tours.
          this._log('navigation adapter threw; falling back to a plain lookup', e)
          res = { target: await this._resolveTarget(resolved) }
        }
        if (gen !== this._renderGeneration) return
        if (waited) this._exitWaiting()

        if (res.timedOut !== undefined) {
          this.emit('step:timeout', { stepId: resolved.id, reason: res.timedOut })
          // emit() runs listeners inline; one calling next() has already moved
          // the machine and bumped the generation by the time we get here.
          if (gen !== this._renderGeneration) return
        }
        target = res.target
      } else {
        target = await this._resolveTarget(resolved)
        if (gen !== this._renderGeneration) return
      }

      if (target === null && resolved.target != null) {
        // A missing target used to render as a silent full-screen modal,
        // indistinguishable from a deliberate `target: null` step.
        this.emit('step:target-missing', {
          stepId: resolved.id,
          selector: typeof resolved.target === 'string' ? resolved.target : null,
        })
        if (gen !== this._renderGeneration) return
      }

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
      this._anchoredTo = target
      this._stepExitEmitted = false

      // Emit event
      this.emit('step:enter', {
        stepId: step.id,
        stepIndex: this._machine.stepIndex,
        target,
      })

      // Delegate to renderer — cast away TContext since renderer never calls showIf.
      // Flow-wide counters, not per-state: the renderer derives "Back", "Next"
      // and "Done" from index/total, so per-state numbers put a Done button on
      // the first step of a multi-state tour.
      // The chapter label, translated if a catalogue supplies one. Falls back to
      // the flow's own `label`, exactly as step content falls back to its own.
      const stateId = this._machine.state
      const chapter = this._options.i18n?.stateLabel(stateId)
        ?? this._machine.currentStateNode?.label

      this._renderer.renderStep(
        step as Step,
        content,
        this._machine.flowStepIndex,
        this._machine.flowTotalSteps,
        chapter,
      )
    } catch (err) {
      // Error boundary — log, emit, and clean up so the page is not left in a broken state
      const flowId = this._flow?.id ?? 'unknown'
      const stepId = step?.id ?? 'unknown'
      this._log('Error rendering step:', stepId, err)
      this.emit('tour:error', { flowId, stepId, error: err })
      this._doEnd(false)
    }
  }

  /**
   * The content pipeline, in one place and in this order:
   *
   *   the step's own content  →  locale catalogue override  →  {{token}} interpolation
   *
   * The order is the whole point of resolving both here rather than in two
   * seams: a *translated* string containing `{{firstName}}` has to work, and it
   * only does if the catalogue is applied before interpolation.
   *
   * **The catalogue may set `html`; a `{{token}}` may not.** They are different
   * trust levels and only one of them is runtime data:
   *
   * | Source | Trust | Reaches `content.html` |
   * |---|---|---|
   * | the flow's own content | ships with your app | yes |
   * | the locale catalogue | a file in your repo, reviewed in a PR | yes |
   * | a `{{token}}` value | **runtime, routinely a URL parameter** | **no** |
   *
   * "Interpolate then sanitise" is not good enough for the third row, for two
   * reasons. **Attribute context:** in `<a href="/r?next={{to}}">` a value
   * containing a quote closes the attribute *before* the sanitiser parses
   * anything, so untrusted data shapes the parse tree and every gap in the
   * allowlist becomes reachable from a URL — and `AUDIT.md` §SEC is a list of
   * gaps that allowlist has already had. **And `sanitizeHTML` is opt-in**
   * (ADR-009), so the exposed configuration would be the one a developer chose
   * *believing it was the hardened one*. That is the worst possible shape.
   *
   * `title` and `body` are unconditional: both leave through the renderer's
   * `_esc`, so a token value can only ever become visible characters.
   * Interpolating after the renderer, or inside it, would put attacker-
   * influenced text past that boundary — do not move this.
   */
  private async _resolveContent(step: Step<TContext>): Promise<StepContent> {
    let content = typeof step.content === 'function' ? await step.content() : step.content

    const override = this._options.i18n?.stepContent(step.id)
    if (override) content = { ...content, ...override }

    const values = this._machine?.context
    if (!values) return content

    // Rebuilt rather than mutated: `step.content` is the author's object and
    // may be the same reference on every render, so writing to it would bake
    // the first user's values into the flow definition permanently.
    return {
      ...content,
      ...(content.title !== undefined && { title: interpolate(content.title, values) }),
      ...(content.body !== undefined && { body: interpolate(content.body, values) }),
    }
  }

  private async _resolveTarget(step: Step<TContext>): Promise<Element | null> {
    // isBrowser() must stay first: the `instanceof Element` below is only safe
    // because of it.
    if (!isBrowser() || step.target == null) return null
    if (typeof step.target === 'function') return await step.target(this._machine!.context)
    if (step.target instanceof Element) return step.target
    if (typeof step.target === 'string') return document.querySelector(step.target)
    return null
  }

  /**
   * Show that the engine is waiting, without unmounting anything.
   *
   * The spotlight goes down immediately: after a route change the previous
   * target is usually detached, and `_update()` would read a zeroed rect off
   * it. `hide()` also sets `pointer-events: none`, so **the page stays
   * clickable during the wait** — a user waiting to reach /settings has to be
   * able to click the nav link. A modal that blocks the navigation it is
   * waiting for can never succeed.
   */
  private _enterWaiting(reason: TimeoutReason, step: Step): void {
    if (this._waiting !== null) return
    this._waiting = reason
    this._spotlight.hide()
    this._renderer.setWaiting?.(true, step)
    this.emit('step:waiting', { stepId: step.id, reason })
  }

  private _exitWaiting(): void {
    if (this._waiting === null) return
    this._waiting = null
    this._renderer.setWaiting?.(false)
  }

  private _attachNavigation(): void {
    if (!isBrowser()) return
    this._detachNavigation()
    this._navOff = this._options.navigation?.attach?.(() => {
      if (!this._active || this._paused || this._waiting !== null) return
      // A route change that left the target mounted needs no work — and a
      // rerender() would re-emit step:enter and double-count in analytics.
      if (this._anchoredTo !== null && this._anchoredTo.isConnected) return
      void this.rerender()
    }) ?? null
  }

  private _detachNavigation(): void {
    if (this._navOff) {
      this._navOff()
      this._navOff = null
    }
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
    this._detachNavigation()
    this._exitWaiting()
    // Cancel any waiter still running. Without this an adapter waiting 15s for
    // a route keeps a timer alive after the tour has ended.
    this._renderAbort?.abort()
    this._renderAbort = null
    this._anchoredTo = null

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

      // Mid-composition keystrokes belong to the IME, not to us. Escape there
      // cancels the composition; arrows move through the candidate list.
      if (e.isComposing || e.keyCode === 229) return
      // A modified key is a browser or OS shortcut.
      if (e.altKey || e.ctrlKey || e.metaKey) return
      // Something closer to the user already claimed this key.
      if (e.defaultPrevented) return

      // Escape closes the dialog from anywhere, per the ARIA authoring
      // practices — including from inside a field, where it is the user's only
      // keyboard escape hatch.
      if (e.key === 'Escape') {
        e.preventDefault()
        this.skip()
        return
      }

      // Never steal a keystroke the user is aiming at a control. This handler
      // is on `document`, so without this guard ArrowLeft/Right could not move
      // a caret, adjust a slider or change a select while a tour was running —
      // worst of all on `clickThrough` steps, which exist precisely so the user
      // can interact with the highlighted element.
      // AUDIT `arrow-keys-break-inputs`.
      if (isEditableTarget(e.target)) return

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
