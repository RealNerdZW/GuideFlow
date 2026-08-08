// ---------------------------------------------------------------------------
// mountBanner() — the docked surface.
//
// A landmark, not a dialog: no role="dialog", no aria-modal, no focus trap. A
// persistent docked surface that swallows Tab is a keyboard trap under WCAG
// 2.1.2, and a second capture-phase trap competing with the renderer's own
// would deadlock the keyboard outright. ADR-011 Decision 4, applied again.
// ---------------------------------------------------------------------------

import { injectStyles, isBrowser, removeStyles } from '@guideflow/core'

import type { BannerController, BannerState } from '../types.js'

import {
  createLiveRegion,
  releaseStyles,
  retainStyles,
  setTourActive,
  type LiveRegion,
} from './a11y.js'
import { DEFAULT_STRINGS, buildSkeleton, nextId, updateBanner, type BannerStrings } from './dom.js'
import { BANNER_CSS, BANNER_STYLE_ID } from './styles.js'

export type { BannerStrings } from './dom.js'

/**
 * Full-width bars only in v1.
 *
 * The four corner values a toast would need are deliberately absent, not
 * forgotten: `mountChecklist`'s default dock is `bottom-end`, neither package
 * can detect the other, and a corner card that never goes away is worse than a
 * bar. Corners arrive with auto-dismiss or not at all — and auto-dismiss drags
 * in WCAG 2.2.1 Timing Adjustable, which is pause, stop and extend.
 */
export type BannerDock = 'top' | 'bottom'

export interface BannerViewOptions {
  /** Default `'top'`. */
  dock?: BannerDock
  /**
   * CSP nonce for the injected stylesheet. Taken once, at mount.
   *
   * There is deliberately no `setNonce`: the de-dupe set inside `injectStyles`
   * is module-level and therefore page-global, so a second injection for the
   * same id returns early and its nonce is never applied.
   */
  nonce?: string
  strings?: Partial<BannerStrings>
  /** Portal parent. Default `document.body`, so it inherits `data-gf-theme`. */
  container?: HTMLElement
}

export interface BannerWidget {
  destroy(): void
}

const NOOP: BannerWidget = { destroy: () => undefined }

export function mountBanner(
  controller: BannerController,
  options: BannerViewOptions = {},
): BannerWidget {
  // SSR: nothing is created, nothing is registered, and the caller gets a
  // widget whose destroy() is safe to call.
  if (!isBrowser()) return NOOP

  injectStyles(BANNER_CSS, BANNER_STYLE_ID, options.nonce)
  retainStyles()

  const strings: BannerStrings = { ...DEFAULT_STRINGS, ...options.strings }
  const container = options.container ?? document.body
  const dock = options.dock ?? 'top'
  const els = buildSkeleton(strings)
  els.root.setAttribute('data-gf-dock', dock)

  let live: LiveRegion | null = null
  let mounted = false
  let previous: BannerState | null = null
  /** Held while a tour is running, so the bar never speaks over the renderer. */
  let pending = ''

  function ensureLive(): LiveRegion {
    live ??= createLiveRegion(nextId('gf-banner-live'))
    return live
  }

  els.dismiss.addEventListener('click', () => {
    const id = controller.getSnapshot().current?.id
    if (id !== undefined) void controller.dismiss(id)
  })

  /**
   * Escape closes the bar, but only while focus is inside it.
   *
   * Scoped to the root and never to `document`: a docked surface that swallows
   * Escape page-wide would eat the tour's own dismiss exactly when the user
   * most wants out. `stopPropagation` for the same reason, and it is what the
   * checklist does.
   */
  els.root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    const snapshot = controller.getSnapshot()
    if (!snapshot.current?.dismissible) return
    if (!els.root.contains(document.activeElement)) return
    event.stopPropagation()
    void controller.dismiss(snapshot.current.id)
  })

  function render(): void {
    const state = controller.getSnapshot()

    // Nothing is painted until the first storage read resolves. Without this a
    // banner the user dismissed last week flashes on screen and vanishes when
    // storage answers.
    const visible = state.hydrated && state.current !== null
    if (!visible || !state.current) {
      if (mounted) {
        els.root.remove()
        mounted = false
      }
      previous = state
      return
    }

    updateBanner(els, state.current, strings, (index) => { void controller.select(index) })
    setTourActive(els.root, state.tourActive)

    if (!mounted) {
      // `dock: 'top'` inserts FIRST so DOM order matches visual order — WCAG
      // 1.3.2 Meaningful Sequence. A host with its own skip link should pass
      // `container` to place the bar inside their layout instead; that is on
      // the docs page.
      if (dock === 'top') container.insertBefore(els.root, container.firstChild)
      else container.appendChild(els.root)
      mounted = true
    }

    announce(previous, state)
    previous = state
  }

  /**
   * Speak a banner once, when it becomes the visible one.
   *
   * Held while a tour is running and released on the falling edge, so the
   * bar's polite utterance never queues behind — or worse, ahead of — the
   * renderer's step announcement. The visible surface is `visibility: hidden`
   * during a tour anyway, so speaking then would describe something the user
   * cannot see or reach.
   */
  function announce(before: BannerState | null, after: BannerState): void {
    if (!after.current) return

    const isNew = before?.current?.id !== after.current.id
    if (isNew) {
      const message = after.current.body
        ? `${after.current.title}. ${after.current.body}`
        : after.current.title
      if (after.tourActive) pending = message
      else ensureLive().announce(message)
      return
    }

    if (before?.tourActive && !after.tourActive && pending) {
      ensureLive().announce(pending)
      pending = ''
    }
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
      // would strip the stylesheet out from under it.
      if (releaseStyles()) removeStyles(BANNER_STYLE_ID)
    },
  }
}
