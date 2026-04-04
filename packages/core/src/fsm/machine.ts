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

    this._callExit(this._ctx.currentState)
    this._ctx.history.push(target)
    this._ctx.currentState = target
    this._ctx.stepIndex = 0
    this._callEntry(target)
    this._notify()
    return true
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

  /** Move to the previous step. Returns false if at first step. */
  prevStep(): boolean {
    if (this._ctx.stepIndex > 0) {
      this._ctx.stepIndex--
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

  goToStepById(stepId: string): boolean {
    const steps = this.currentSteps
    const idx = steps.findIndex((s) => s.id === stepId)
    if (idx === -1) return false
    return this.goToStep(idx)
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

  restore(snapshot: { state: string; stepIndex: number; context?: TContext }): void {
    if (!(snapshot.state in this._ctx.flow.states)) return
    this._ctx.currentState = snapshot.state
    this._ctx.stepIndex = snapshot.stepIndex
    if (snapshot.context) this._ctx.context = snapshot.context
    this._notify()
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
