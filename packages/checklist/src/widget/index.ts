// ---------------------------------------------------------------------------
// mountChecklist() — the docked widget.
//
// A disclosure, not a dialog: no role="dialog", no aria-modal, no focus trap.
// A persistent docked surface that swallows Tab is a keyboard trap under WCAG
// 2.1.2, and a second capture-phase trap competing with the renderer's own
// would deadlock the keyboard outright.
// ---------------------------------------------------------------------------

import { injectStyles, isBrowser, removeStyles } from '@guideflow/core'

import type { ChecklistController, ChecklistState } from '../types.js'

import {
  createLiveRegion,
  releaseStyles,
  restoreFocus,
  retainStyles,
  setTourActive,
  type LiveRegion,
} from './a11y.js'
import {
  DEFAULT_STRINGS,
  buildSkeleton,
  format,
  nextId,
  patchList,
  updateChrome,
  type ChecklistStrings,
} from './dom.js'
import { CHECKLIST_CSS, CHECKLIST_STYLE_ID } from './styles.js'

export type { ChecklistStrings } from './dom.js'

export type ChecklistDock = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start'

export interface ChecklistViewOptions {
  dock?: ChecklistDock
  /**
   * CSP nonce for the injected stylesheet. Taken once, at mount.
   *
   * There is deliberately no `setNonce`: the de-dupe set inside `injectStyles`
   * is module-level and therefore page-global, so a second injection for the
   * same id returns early and its nonce is never applied. A setter that only
   * ever affected the first mount would be worse than not offering one.
   */
  nonce?: string
  strings?: Partial<ChecklistStrings>
  /** Portal parent. Default `document.body`, so it inherits `data-gf-theme`. */
  container?: HTMLElement
}

export interface ChecklistView {
  destroy(): void
}

const NOOP_VIEW: ChecklistView = { destroy: () => undefined }

export function mountChecklist(
  controller: ChecklistController,
  options: ChecklistViewOptions = {},
): ChecklistView {
  // SSR: nothing is created, nothing is registered, and the caller gets a view
  // whose destroy() is safe to call.
  if (!isBrowser()) return NOOP_VIEW

  injectStyles(CHECKLIST_CSS, CHECKLIST_STYLE_ID, options.nonce)
  retainStyles()

  const strings: ChecklistStrings = { ...DEFAULT_STRINGS, ...options.strings }
  const container = options.container ?? document.body
  const els = buildSkeleton(strings)
  els.root.setAttribute('data-gf-dock', options.dock ?? 'bottom-end')

  let live: LiveRegion | null = null
  let mounted = false
  let previous: ChecklistState | null = null
  /** Held while a tour is running so the checklist never speaks over the renderer. */
  let pendingAnnouncement = ''
  /** The row that started the running tour, so focus can come back to it. */
  let activatedItemId: string | null = null

  function ensureLive(): LiveRegion {
    live ??= createLiveRegion(nextId('gf-checklist-live'))
    return live
  }

  // ── Interaction ──────────────────────────────────────────────────────────

  els.launcher.addEventListener('click', () => {
    const collapsed = controller.getSnapshot().collapsed
    controller.setCollapsed(!collapsed)
    // Opening moves focus into the panel; closing returns it to the launcher.
    // Both happen after the patch, so the target exists.
    queueMicrotask(() => {
      if (collapsed) els.title.focus()
      else els.launcher.focus()
    })
  })

  els.dismiss.addEventListener('click', () => {
    void controller.dismiss()
  })

  els.root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (controller.getSnapshot().collapsed) return
    event.stopPropagation()
    controller.setCollapsed(true)
    els.launcher.focus()
  })

  function activate(itemId: string): void {
    activatedItemId = itemId
    void controller.activate(itemId)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  function render(): void {
    const state = controller.getSnapshot()

    // Nothing is painted until the first storage read resolves. Without this
    // the widget shows "0 of 5", jumps to "3 of 5", and the live region
    // announces the flash.
    const visible = state.hydrated && !state.hidden
    if (!visible) {
      if (mounted) {
        els.root.remove()
        mounted = false
      }
      previous = state
      return
    }

    updateChrome(els, state, strings)
    patchList(els.list, state.items, strings, activate)
    setTourActive(els.root, state.tourActive)

    if (!mounted) {
      container.appendChild(els.root)
      mounted = true
    }

    announce(previous, state)
    restoreAfterTour(previous, state)
    previous = state
  }

  /**
   * One utterance per change, aggregate only — never per-item chatter.
   *
   * Suppressed across the hydration transition (that is what `hydrated` is
   * for) and across open/close, which `aria-expanded` already carries.
   */
  function announce(before: ChecklistState | null, after: ChecklistState): void {
    if (!before?.hydrated) return

    const newlyDone = after.items
      .filter((item) => item.done && before.items.find((b) => b.id === item.id)?.done === false)
      .map((item) => item.title)
    if (newlyDone.length === 0) return

    const progress = format(strings.progressText, {
      done: String(after.doneCount),
      total: String(after.totalCount),
    })
    const message = `${newlyDone.join(', ')}, ${strings.completed.toLowerCase()}. ${progress}`

    // Gate on the state's tourActive, which the controller sets by reading
    // `gf.isActive` directly rather than by inferring it from listener order —
    // listener order flips across a React remount.
    if (after.tourActive) pendingAnnouncement = message
    else ensureLive().announce(message)
  }

  /**
   * On the falling edge of a tour, put focus back where it came from.
   *
   * Core restores to whatever was focused before the tour, but only if that
   * element is still connected. The button that launched the tour is gone once
   * the row is done, so focus lands on <body>. The <li> survives — the list is
   * patched in place — and takes it instead.
   */
  function restoreAfterTour(before: ChecklistState | null, after: ChecklistState): void {
    if (!before?.tourActive || after.tourActive) return

    if (pendingAnnouncement) {
      ensureLive().announce(pendingAnnouncement)
      pendingAnnouncement = ''
    }

    const itemId = activatedItemId
    activatedItemId = null
    if (itemId === null) return
    if (document.activeElement !== document.body) return
    const row = els.list.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`)
    restoreFocus(row)
  }

  const unsubscribe = controller.subscribe(render)
  render()

  return {
    destroy(): void {
      unsubscribe()
      els.root.remove()
      live?.destroy()
      live = null
      mounted = false
      // Only when this was the last mount. `injectStyles` de-dupes by id, so a
      // second mount injects nothing and an unconditional `removeStyles` here
      // stripped the stylesheet out from under it.
      if (releaseStyles()) removeStyles(CHECKLIST_STYLE_ID)
    },
  }
}
