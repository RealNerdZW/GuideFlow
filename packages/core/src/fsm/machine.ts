// ---------------------------------------------------------------------------
// GuideFlow Minimal FSM — Zero dependencies
// XState-compatible API surface for optional adapter compatibility
// ---------------------------------------------------------------------------

import type { GuidanceContext, FlowDefinition } from '../types/index.js'

import type { MachineContext, MachineListener } from './types.js'

export class FlowMachine<TContext extends GuidanceContext = GuidanceContext> {
  private _ctx: MachineContext<TContext>
  private _listeners = new Set<MachineListener<TContext>>()

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

  get isFinal(): boolean {
    return this._ctx.flow.states[this._ctx.currentState]?.final === true
  }

  get totalSteps(): number {
    return this.currentSteps.length
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
  restore(snapshot: { state: string; stepIndex: number; context?: TContext }): boolean {
    const node = this._ctx.flow.states[snapshot.state]
    if (!node) return false

    const stepCount = node.steps?.length ?? 0
    const raw = Math.trunc(Number(snapshot.stepIndex))
    const index = Number.isFinite(raw) ? Math.min(Math.max(0, raw), Math.max(0, stepCount - 1)) : 0

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
