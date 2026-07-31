// ---------------------------------------------------------------------------
// GuideFlow Minimal FSM — Zero dependencies
// XState-compatible API surface for optional adapter compatibility
// ---------------------------------------------------------------------------

import type { GuidanceContext, FlowDefinition, FlowTransition, StateNode } from '../types/index.js'

import type { MachineContext, MachineListener } from './types.js'

export class FlowMachine<TContext extends GuidanceContext = GuidanceContext> {
  private _ctx: MachineContext<TContext>
  private _listeners = new Set<MachineListener<TContext>>()
  private _pathCache: string[] | null = null

  constructor(flow: FlowDefinition<TContext>, context?: TContext) {
    // Validate that the initial state exists in the flow definition
    if (!(flow.initial in flow.states)) {
      throw new Error(
        `[GuideFlow FSM] Initial state "${flow.initial}" does not exist in flow states: [${Object.keys(flow.states).join(', ')}]`,
      )
    }
    this._ctx = {
      flow,
      context: (context ?? flow.context ?? {}) as TContext,
      currentState: flow.initial,
      stepIndex: 0,
      history: [flow.initial],
    }
    this._callEntry(flow.initial)
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  get state(): string {
    return this._ctx.currentState
  }

  get stepIndex(): number {
    return this._ctx.stepIndex
  }

  get context(): TContext {
    return this._ctx.context
  }

  matches(state: string): boolean {
    return this._ctx.currentState === state
  }

  get currentSteps() {
    return this._ctx.flow.states[this._ctx.currentState]?.steps ?? []
  }

  get currentStep() {
    return this.currentSteps[this._ctx.stepIndex] ?? null
  }

  /**
   * The definition node for the current state. This is what carries `route`.
   *
   * `?? null` because of `noUncheckedIndexedAccess`. Nothing else in the FSM
   * changes for route support — `_defaultPath` never reads `route`, which is
   * the whole argument for putting routes on states rather than transitions.
   */
  get currentStateNode(): StateNode<TContext> | null {
    return this._ctx.flow.states[this._ctx.currentState] ?? null
  }

  get isFinal(): boolean {
    return this._ctx.flow.states[this._ctx.currentState]?.final === true
  }

  /** Steps in the current state only. */
  get totalSteps(): number {
    return this.currentSteps.length
  }

  /**
   * The states a plain next()-only run visits, in order, starting from
   * `initial`.
   *
   * Computed once and cached: a flow definition is immutable for the life of a
   * machine, and `_renderCurrentStep` reads the progress counters on every step.
   * The walk follows each state's `NEXT` transition — or its single outgoing
   * transition, if it has exactly one — and stops at a final state, at a state
   * with no unambiguous successor, or on revisiting a state (a loop has no
   * finite length).
   */
  private get _defaultPath(): string[] {
    if (this._pathCache) return this._pathCache

    const path: string[] = []
    const seen = new Set<string>()
    let state = this._ctx.flow.initial as string | undefined

    while (state !== undefined && !seen.has(state)) {
      seen.add(state)
      path.push(state)
      state = this._defaultSuccessor(state)
    }

    this._pathCache = path
    return path
  }

  /**
   * The state a plain next() would land in from `from`, or `undefined` if
   * next() would end the tour there instead.
   *
   * `NEXT` only, deliberately. `nextStep()` falls back to exactly `send('NEXT')`
   * when a state's steps run out, so a state reachable only by some other event
   * — a `HELP` branch, a `JUMP` — is not on the path a next()-only run takes and
   * must not be counted in it.
   *
   * A separate method rather than inline in the loop above: assigning the loop
   * variable from an expression that reads `flow.states[state]` makes the whole
   * chain self-referential, and TypeScript refuses to infer it (TS7022).
   */
  private _defaultSuccessor(from: string): string | undefined {
    const node: StateNode<TContext> | undefined = this._ctx.flow.states[from]
    if (!node || node.final === true) return undefined

    const transition: string | FlowTransition<TContext> | undefined = node.on?.['NEXT']
    const target: string | undefined =
      typeof transition === 'string' ? transition : transition?.target
    return target !== undefined && target in this._ctx.flow.states ? target : undefined
  }

  /**
   * Steps across the whole flow, not just the current state.
   *
   * `totalSteps` counted the current state only, so a two-state flow announced
   * "Step 1 of 1" in its first state and the renderer offered "Done" halfway
   * through — AUDIT `total-steps-is-per-state`. Branching flows have no single
   * honest total; the default path is the best available answer and degrades to
   * `totalSteps` when the current state is not on it.
   */
  get flowTotalSteps(): number {
    const path = this._defaultPath
    if (!path.includes(this._ctx.currentState)) return this.currentSteps.length
    return path.reduce(
      (sum, name) => sum + (this._ctx.flow.states[name]?.steps?.length ?? 0),
      0,
    )
  }

  /** Zero-based position of the current step within {@link flowTotalSteps}. */
  get flowStepIndex(): number {
    const path = this._defaultPath
    const at = path.indexOf(this._ctx.currentState)
    if (at === -1) return this._ctx.stepIndex
    return path
      .slice(0, at)
      .reduce((sum, name) => sum + (this._ctx.flow.states[name]?.steps?.length ?? 0), 0)
      + this._ctx.stepIndex
  }

  // ── Transitions ───────────────────────────────────────────────────────────

  send(event: string): boolean {
    const stateNode = this._ctx.flow.states[this._ctx.currentState]
    if (!stateNode?.on) return false

    const transition = stateNode.on[event]
    if (!transition) return false

    const target = typeof transition === 'string' ? transition : transition.target
    const guard = typeof transition === 'object' ? (transition).guard : undefined

    if (guard && !guard(this._ctx.context)) return false

    // A transition to a state that does not exist used to succeed, leaving the
    // machine somewhere with no steps, `isFinal: false` and nothing to render —
    // a tour that is "active" but frozen. See AUDIT `fsm-send-to-nonexistent-state`.
    if (!(target in this._ctx.flow.states)) {
      console.warn(`[GuideFlow] Unknown transition target "${target}" for event "${event}".`)
      return false
    }

    this._enterState(target)
    return true
  }

  /** Shared state-entry transition: exit hook, history, index reset, entry hook. */
  private _enterState(target: string, stepIndex = 0): void {
    this._callExit(this._ctx.currentState)
    this._ctx.history.push(target)
    this._ctx.currentState = target
    this._ctx.stepIndex = stepIndex
    this._callEntry(target)
    this._notify()
  }

  /** Advance to the next step within the current state. Returns false if at last step. */
  nextStep(): boolean {
    const steps = this.currentSteps
    if (this._ctx.stepIndex < steps.length - 1) {
      this._ctx.stepIndex++
      this._notify()
      return true
    }
    // Attempt automatic NEXT transition
    return this.send('NEXT')
  }

  /**
   * Move to the previous step, crossing back into the previous state when
   * already at index 0.
   *
   * Back navigation used to be intra-state only: at index 0 this returned
   * `false` and `TourEngine.prev()` re-rendered the same step anyway, emitting a
   * duplicate `step:enter`. `history` was written and never read.
   * See AUDIT `fsm-navigation-cannot-cross-states`.
   */
  prevStep(): boolean {
    if (this._ctx.stepIndex > 0) {
      this._ctx.stepIndex--
      this._notify()
      return true
    }

    // Walk back through history to the nearest previous state that has steps.
    const history = this._ctx.history
    for (let i = history.length - 2; i >= 0; i--) {
      const candidate = history[i]
      if (candidate === undefined) continue
      const steps = this._ctx.flow.states[candidate]?.steps
      if (!steps || steps.length === 0) continue

      this._callExit(this._ctx.currentState)
      history.length = i + 1
      this._ctx.currentState = candidate
      this._ctx.stepIndex = steps.length - 1
      this._callEntry(candidate)
      this._notify()
      return true
    }

    return false
  }

  goToStep(index: number): boolean {
    const steps = this.currentSteps
    if (index < 0 || index >= steps.length) return false
    this._ctx.stepIndex = index
    this._notify()
    return true
  }

  /**
   * Jump to a step by id, anywhere in the flow.
   *
   * This used to search only the current state's steps, so `gf.goTo(id)` for a
   * step in another state silently did nothing (and `TourEngine.goTo` ignored
   * the `false` and re-rendered the step it was already on).
   * See AUDIT `fsm-navigation-cannot-cross-states`.
   */
  goToStepById(stepId: string): boolean {
    const localIdx = this.currentSteps.findIndex((s) => s.id === stepId)
    if (localIdx !== -1) return this.goToStep(localIdx)

    for (const [stateId, node] of Object.entries(this._ctx.flow.states)) {
      if (stateId === this._ctx.currentState) continue
      const idx = node.steps?.findIndex((s) => s.id === stepId) ?? -1
      if (idx === -1) continue
      this._enterState(stateId, idx)
      return true
    }

    return false
  }

  updateContext(patch: Partial<TContext>): void {
    this._ctx.context = { ...this._ctx.context, ...patch }
  }

  // ── Snapshot / Restore ────────────────────────────────────────────────────

  snapshot(): { state: string; stepIndex: number; context: TContext } {
    return {
      state: this._ctx.currentState,
      stepIndex: this._ctx.stepIndex,
      context: { ...this._ctx.context },
    }
  }

  /**
   * Restore a persisted position. Returns false when the snapshot does not fit
   * this flow.
   *
   * Snapshots come from storage, which is untrusted — another script or the
   * user can edit it, and a snapshot saved against an older build of the flow
   * may name a step index the state no longer has. `stepIndex` used to be
   * written verbatim, leaving `currentStep === null` and an active tour with
   * nothing to render. See AUDIT `machine-restore-unvalidated`.
   */
  /**
   * Move to a persisted position, or refuse.
   *
   * Prefers `stepId` over `stepIndex`: an index means nothing once a step has
   * been inserted above it, and a stored index of 2 could land the user
   * anywhere. A `stepId` that no longer exists is a *rejection*, not something
   * to clamp — there is no honest coordinate to resume to.
   */
  restore(snapshot: {
    state: string
    stepIndex: number
    stepId?: string
    context?: TContext
  }): boolean {
    const steps = this._ctx.flow.states[snapshot.state]?.steps ?? []
    // `length === 0` subsumes the old missing-state check and additionally
    // rejects a state with no steps — which used to return true and leave an
    // "active" tour with nothing on screen, because the render bails on a null
    // currentStep.
    if (steps.length === 0) return false

    let index: number
    const wanted = snapshot.stepId
    if (wanted !== undefined) {
      index = steps.findIndex((s) => s.id === wanted)
      if (index === -1) return false
    } else {
      // No stepId: byte-for-byte the old clamping behaviour, so legacy
      // snapshots resume exactly as they did.
      const raw = Math.trunc(Number(snapshot.stepIndex))
      index = Number.isFinite(raw) ? Math.min(Math.max(0, raw), steps.length - 1) : 0
    }

    this._ctx.currentState = snapshot.state
    this._ctx.stepIndex = index
    if (snapshot.context) this._ctx.context = snapshot.context
    this._notify()
    return true
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  subscribe(listener: MachineListener<TContext>): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _notify(): void {
    this._listeners.forEach((fn) => fn({ ...this._ctx }))
  }

  private _callEntry(state: string): void {
    this._ctx.flow.states[state]?.onEntry?.(this._ctx.context)
  }

  private _callExit(state: string): void {
    this._ctx.flow.states[state]?.onExit?.(this._ctx.context)
  }
}

// ── Factory (XState-compatible style) ─────────────────────────────────────────

export function createMachine<TContext extends GuidanceContext = GuidanceContext>(
  definition: FlowDefinition<TContext>,
  context?: TContext,
): FlowMachine<TContext> {
  return new FlowMachine<TContext>(definition, context)
}
