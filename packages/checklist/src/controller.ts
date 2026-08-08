// ---------------------------------------------------------------------------
// createChecklist() — the headless half.
//
// Owns identity, storage, the derive, snapshot identity and the tour
// subscriptions. Knows nothing about the DOM: `mountChecklist()` is a separate
// entry point so a host that renders its own list pays none of the widget's
// bytes.
// ---------------------------------------------------------------------------

import type { GuidanceContext, GuideFlowInstance } from '@guideflow/core'

import { deriveChecklist } from './derive.js'
import { identity } from './identity.js'
import { serverSnapshot, stabilise } from './snapshot.js'
import { clearList, emptyList, loadRecord, mergeList, readList, type StoredList } from './store.js'
import type {
  ChecklistController,
  ChecklistDefinition,
  ChecklistEvent,
  ChecklistOptions,
  ChecklistState,
} from './types.js'

export function createChecklist<TContext extends GuidanceContext = GuidanceContext>(
  gf: GuideFlowInstance<TContext>,
  definition: ChecklistDefinition,
  options: ChecklistOptions = {},
): ChecklistController {
  const listeners = new Set<() => void>()
  const unsubscribes: Array<() => void> = []

  let destroyed = false
  let stored: StoredList = emptyList()
  let completedFlows: readonly string[] = []
  /**
   * Flows this session saw complete, unioned into `completedFlows`.
   *
   * Filled from the `tour:complete` payload. Core defers its own
   * `markCompleted` into a floating async IIFE, so re-reading `isCompleted`
   * from that handler races the write — the payload is the only synchronous
   * truth available at that instant.
   */
  const sessionCompleted = new Set<string>()
  let userId: string | null = null
  let hydrated = false
  let snapshot: ChecklistState | null = null

  /** Serialises every write within this tab. Cross-tab is last-write-wins. */
  let queue: Promise<void> = Promise.resolve()

  // ── State ────────────────────────────────────────────────────────────────

  function build(): ChecklistState {
    const derived = deriveChecklist(definition, {
      completedFlows:
        sessionCompleted.size === 0
          ? completedFlows
          : [...new Set([...completedFlows, ...sessionCompleted])],
      manual: stored.done,
    })
    const dismissed = stored.dismissed === true
    return {
      id: definition.id,
      title: definition.title,
      items: derived.items,
      doneCount: derived.doneCount,
      totalCount: derived.totalCount,
      complete: derived.complete,
      dismissed,
      collapsed: stored.collapsed === true,
      hidden: dismissed || (derived.complete && definition.hideWhenComplete !== false),
      tourActive: gf.isActive,
      persisted: userId !== null,
      hydrated,
    }
  }

  function getSnapshot(): ChecklistState {
    if (!snapshot) snapshot = build()
    return snapshot
  }

  /** Rebuild, keep every unchanged reference, notify only on a real change. */
  function publish(): void {
    if (destroyed) return
    const next = stabilise(snapshot, build())
    if (next === snapshot) return
    snapshot = next
    for (const listener of listeners) {
      // The emitter core ships has no error isolation: one throwing listener
      // stops every later one. A checklist must never be the reason a tour
      // fails to paint, so isolation is this package's job.
      try {
        listener()
      } catch (error) {
        console.error('[@guideflow/checklist] A subscriber threw. It was isolated.', error)
      }
    }
  }

  function emit(event: ChecklistEvent): void {
    const onEvent = options.onEvent
    if (!onEvent) return
    try {
      onEvent(event)
    } catch (error) {
      console.error('[@guideflow/checklist] onEvent threw. It was isolated.', error)
    }
  }

  // ── Storage ──────────────────────────────────────────────────────────────

  async function read(): Promise<void> {
    userId = identity(gf, options.anonymousId === true)
    if (userId === null) {
      stored = emptyList()
      completedFlows = []
      hydrated = true
      publish()
      return
    }

    const [record, flows] = await Promise.all([
      loadRecord(gf.progress, userId),
      gf.progress.getCompletedFlows(userId),
    ])
    stored = readList(record, definition.id, definition.version)
    completedFlows = Array.isArray(flows) ? flows : []
    hydrated = true
    publish()
  }

  /** Append a write to the chain, apply the merged result, publish. */
  function write(patch: Parameters<typeof mergeList>[4]): Promise<void> {
    const run = queue.then(async () => {
      if (destroyed) return
      if (userId === null) {
        // No identity: hold the change in memory for the session so the UI is
        // still honest, and write nothing.
        stored = applyLocally(stored, patch)
        publish()
        return
      }
      stored = await mergeList(gf.progress, userId, definition.id, definition.version, patch)
      publish()
    })
    queue = run.catch((error: unknown) => {
      console.error('[@guideflow/checklist] Persisting the checklist failed.', error)
    })
    return queue
  }

  function applyLocally(base: StoredList, patch: Parameters<typeof mergeList>[4]): StoredList {
    const done = { ...base.done, ...(patch.done ?? {}) }
    for (const id of patch.undone ?? []) delete done[id]
    return {
      ...base,
      done,
      ...(patch.dismissed !== undefined && { dismissed: patch.dismissed }),
      ...(patch.collapsed !== undefined && { collapsed: patch.collapsed }),
      t: Date.now(),
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function itemState(itemId: string): ChecklistState['items'][number] | undefined {
    return getSnapshot().items.find((i) => i.id === itemId)
  }

  async function complete(itemId: string): Promise<void> {
    const before = itemState(itemId)
    if (!before || before.done) return
    // Deliberately NOT progress.markCompleted(). `gf.start()` gates on
    // `isCompleted` and returns silently, so recording a flow as complete
    // because a checkbox was ticked would permanently suppress the tour this
    // item launches, with no error and no return value to inspect.
    await write({ done: { [itemId]: Date.now() } })
    emit({ type: 'item-complete', itemId, source: 'manual' })
    if (getSnapshot().complete) emit({ type: 'complete' })
  }

  async function uncomplete(itemId: string): Promise<void> {
    const before = itemState(itemId)
    // A flow-derived tick is not ours to remove: it lives in ProgressStore's
    // completed-flows array, and core has no `clearCompleted`.
    if (!before || before.source === 'flow') return
    await write({ undone: [itemId] })
  }

  async function activate(itemId: string): Promise<void> {
    const item = itemState(itemId)
    if (!item || !item.available) return
    // A done item is replayable when it is flow-backed — the user asked, by
    // selecting a row the widget renders as a live control. A manually ticked
    // item has nothing to re-run.
    const replay = item.done
    if (replay && item.flowId === null) return
    // Never interrupt: TourEngine.start() ends a running tour first, which
    // emits tour:abandon — analytics would log that as the user giving up.
    if (gf.isActive) return

    const definitionItem = definition.items.find((i) => i.id === itemId)
    emit({ type: 'item-activate', itemId })

    if (definitionItem?.onActivate) {
      await definitionItem.onActivate()
      return
    }
    // `force` on a replay, never `progress.clearCompleted()`: clearing would
    // un-tick THIS row, so the user's reward for re-reading a guide would be
    // losing the tick they earned. `force` skips `start()`'s completed and
    // dismissed gates and writes nothing (ADR-021).
    if (item.flowId !== null) {
      await gf.start(item.flowId, undefined, replay ? { force: true } : {})
    }
  }

  function setCollapsed(collapsed: boolean): void {
    void write({ collapsed })
  }

  async function dismiss(): Promise<void> {
    if (getSnapshot().dismissed) return
    await write({ dismissed: true })
    emit({ type: 'dismiss' })
  }

  async function reset(): Promise<void> {
    sessionCompleted.clear()
    if (userId === null) {
      stored = emptyList()
      publish()
      return
    }
    const id = userId
    await queue.then(() => clearList(gf.progress, id, definition.id))
    stored = emptyList()
    publish()
  }

  async function refresh(): Promise<void> {
    if (destroyed) return
    await read()
  }

  // ── Tour subscriptions ───────────────────────────────────────────────────

  /** Every handler body is isolated: core's emitter propagates a throw to the caller. */
  function on<K extends 'tour:start' | 'tour:complete' | 'tour:abandon' | 'progress:discard'>(
    event: K,
    handler: () => void,
  ): void {
    unsubscribes.push(
      gf.on(event, () => {
        try {
          handler()
        } catch (error) {
          console.error(`[@guideflow/checklist] Handling ${event} threw. It was isolated.`, error)
        }
      }),
    )
  }

  unsubscribes.push(
    gf.on('tour:complete', (payload) => {
      try {
        const flowId = payload.flowId
        const item = definition.items.find((i) => i.flowId === flowId)
        sessionCompleted.add(flowId)
        publish()
        if (item) {
          emit({ type: 'item-complete', itemId: item.id, source: 'flow' })
          if (getSnapshot().complete) emit({ type: 'complete' })
        }
      } catch (error) {
        console.error('[@guideflow/checklist] Handling tour:complete threw. It was isolated.', error)
      }
    }),
  )
  on('tour:start', publish)
  on('tour:complete', publish)
  on('tour:abandon', publish)
  on('progress:discard', () => void refresh())

  void read()

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot,
    getServerSnapshot: () => serverSnapshot(definition),
    complete,
    uncomplete,
    activate,
    setCollapsed,
    dismiss,
    reset,
    refresh,
    destroy(): void {
      destroyed = true
      for (const off of unsubscribes) off()
      unsubscribes.length = 0
      listeners.clear()
    },
  }
}
