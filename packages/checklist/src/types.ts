// ---------------------------------------------------------------------------
// Public types
//
// A checklist is a PROJECTION of data that already exists — `ProgressStore`'s
// completed-flows array — plus a small record of its own for the items that no
// flow backs. It is never a second source of truth. See ADR-011.
// ---------------------------------------------------------------------------

import type { GuidanceContext, GuideFlowInstance } from '@guideflow/core'

// ── Definition (input) ─────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string
  title: string
  description?: string
  /**
   * Flow this item tracks. The item ticks when this id appears in
   * `progress.getCompletedFlows(userId)`, and `activate()` starts it.
   *
   * A flow-backed item is a projection, never a copy: the checklist reads that
   * array and never writes to it.
   */
  flowId?: string
  /** Item ids that must be done before this one is actionable. */
  requires?: string[]
  /** Runs instead of `gf.start(flowId)` when activated. Wins when both are set. */
  onActivate?: () => void | Promise<void>
}

export interface ChecklistDefinition {
  id: string
  title: string
  items: ChecklistItem[]
  /**
   * Opaque revision marker for the list's SHAPE — bump it when items are
   * renamed, reordered or replaced. A stored record carrying a different value
   * is discarded (with a `console.warn`) rather than migrated.
   *
   * Distinct from the record's own `v` wire-format version: `v` is how the
   * bytes are laid out, `version` is what the product team changed.
   */
  version?: string | number
  /** Hide the widget once every item is done. Default `true`. */
  hideWhenComplete?: boolean
}

// ── State (output) ─────────────────────────────────────────────────────────
//
// Produced objects use `readonly x: T | undefined`, NOT `readonly x?: T`.
// Under exactOptionalPropertyTypes an optional key on a produced object forces
// the conditional-spread idiom at every construction site; a required key that
// may be undefined does not, and reads identically at the call site.

export interface ChecklistItemState {
  readonly id: string
  readonly title: string
  readonly description: string | undefined
  readonly done: boolean
  /** How it became done. `null` while not done. */
  readonly source: 'flow' | 'manual' | null
  /** False when a `requires` dependency is unmet. Rendered aria-disabled, not disabled. */
  readonly available: boolean
  /** Ids of the unmet `requires` entries. Empty when available. */
  readonly blockedBy: readonly string[]
  readonly flowId: string | null
}

export interface ChecklistState {
  readonly id: string
  readonly title: string
  readonly items: readonly ChecklistItemState[]
  readonly doneCount: number
  readonly totalCount: number
  readonly complete: boolean
  readonly dismissed: boolean
  readonly collapsed: boolean
  /**
   * This list has nothing left to show: dismissed, or complete with
   * `hideWhenComplete`.
   *
   * Derived state rather than a config read, so a host rendering its own list
   * makes the same call the bundled widget does without being handed the
   * definition a second time.
   */
  readonly hidden: boolean
  /** A tour is running: the widget is inert and visually hidden. */
  readonly tourActive: boolean
  /** False when there is no identity — nothing is read and nothing is written. */
  readonly persisted: boolean
  /**
   * False until the first storage read resolves.
   *
   * Every ProgressStore method is async, so the first paint has no persisted
   * data. Without this the widget renders "0 of 5", jumps to "3 of 5", and the
   * polite live region announces the flash. The widget renders NOTHING while
   * this is false, and the controller suppresses announcements across the
   * false→true transition.
   */
  readonly hydrated: boolean
}

// ── Events ─────────────────────────────────────────────────────────────────
//
// A plain callback, deliberately NOT the `TourEvents` bus. Seven hardcoded
// event-name arrays across react/vue/svelte/analytics/devtools/demo already
// disagree with each other about which events exist; adding four more to that
// surface buys observability that `subscribe()` already delivers with zero
// edit sites.

export type ChecklistEvent =
  | { readonly type: 'item-complete'; readonly itemId: string; readonly source: 'flow' | 'manual' }
  | { readonly type: 'item-activate'; readonly itemId: string }
  | { readonly type: 'complete' }
  | { readonly type: 'dismiss' }

// ── Options ────────────────────────────────────────────────────────────────

export interface ChecklistOptions {
  /**
   * Mint and persist a first-party id when `context.userId` is unset.
   * Default `false` — this package cannot consult `@guideflow/analytics`'s
   * consent and Do-Not-Track policy. With it off the checklist still renders
   * and still derives flow completion for the session; only persistence is
   * skipped.
   */
  anonymousId?: boolean
  /**
   * Fires after every state-affecting action. Synchronous, wrapped in
   * try/catch by the controller. This is the analytics seam: route it into
   * `collector.track('guideflow.checklist.item_completed', { … })` yourself.
   * The package does not depend on `@guideflow/analytics`.
   */
  onEvent?: (event: ChecklistEvent) => void
}

// ── Controller ─────────────────────────────────────────────────────────────

export interface ChecklistController {
  /** Shaped for `useSyncExternalStore`. Pre-bound; pass directly. */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Referentially stable while nothing changed — item objects are reused
   * field-by-field, not just the top-level snapshot. A fresh array on every
   * call is an infinite render loop in React.
   */
  readonly getSnapshot: () => ChecklistState
  /** A frozen idle state with `hydrated: false`. SSR and hydration agree. */
  readonly getServerSnapshot: () => ChecklistState

  /**
   * Mark an item done from host code. Idempotent, persisted, merge-on-write.
   *
   * NEVER calls `progress.markCompleted`. `gf.start()` gates on `isCompleted`
   * and returns silently, so recording a flow as complete because a checkbox
   * was ticked would permanently suppress the tour that item launches. On a
   * flow-backed item this writes a `manual` tick and nothing else.
   */
  complete(itemId: string): Promise<void>
  /** Remove a MANUAL tick only. Cannot un-tick a flow-derived item. */
  uncomplete(itemId: string): Promise<void>
  /**
   * Run `onActivate`, else `gf.start(flowId)`.
   * No-op when the item is unavailable, already done, or `gf.isActive`.
   */
  activate(itemId: string): Promise<void>

  setCollapsed(collapsed: boolean): void
  dismiss(): Promise<void>
  /** Clear this checklist's own record. Does NOT touch ProgressStore's completed flows. */
  reset(): Promise<void>
  /** Re-read storage and re-derive. Call after your app changes `context.userId`. */
  refresh(): Promise<void>
  destroy(): void
}

/** Signature of {@link createChecklist}, kept here so `types.ts` is the contract. */
export type CreateChecklist = <TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definition: ChecklistDefinition,
  options?: ChecklistOptions,
) => ChecklistController

// ── The pure core ──────────────────────────────────────────────────────────

export interface DeriveInput {
  /** From `progress.getCompletedFlows(userId)`. Tolerates a non-array. */
  readonly completedFlows: readonly string[]
  /** itemId → epoch ms. From the stored record's `done` map. */
  readonly manual: Readonly<Record<string, number>>
}

export interface DeriveResult {
  readonly items: readonly ChecklistItemState[]
  readonly doneCount: number
  readonly totalCount: number
  readonly complete: boolean
}
