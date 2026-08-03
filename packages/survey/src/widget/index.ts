// ---------------------------------------------------------------------------
// mountSurvey() — the docked card.
//
// A landmark, not a dialog: no role="dialog", no aria-modal, no focus trap. A
// survey does not demand an answer, and a persistent docked surface that
// swallows Tab is a keyboard trap under WCAG 2.1.2. ADR-011 Decision 4, applied
// a third time.
// ---------------------------------------------------------------------------

import { injectStyles, isBrowser, removeStyles } from '@guideflow/core'

import type { SurveyController, SurveyState } from '../types.js'

import {
  createLiveRegion,
  releaseStyles,
  retainStyles,
  setTourActive,
  type LiveRegion,
} from './a11y.js'
import { DEFAULT_STRINGS, buildSkeleton, nextId, updateSurvey, type SurveyStrings } from './dom.js'
import { SURVEY_CSS, SURVEY_STYLE_ID } from './styles.js'

export type { SurveyStrings } from './dom.js'

/**
 * Corners only.
 *
 * A survey is a card, not a bar: an eleven-point scale and a comment box across
 * the full viewport width is a form, and a form docked to the top of the page
 * reads as a demand. `bottom-end` is the conventional NPS position and the
 * default here — note it is also `mountChecklist`'s default dock, and neither
 * package can detect the other, so pick different corners if you mount both.
 */
export type SurveyDock = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start'

export interface SurveyViewOptions {
  /** Default `'bottom-end'`. */
  dock?: SurveyDock
  /**
   * CSP nonce for the injected stylesheet. Taken once, at mount.
   *
   * There is deliberately no `setNonce`: the de-dupe set inside `injectStyles`
   * is module-level and page-global, so a second injection for the same id
   * returns early and its nonce is never applied.
   */
  nonce?: string
  strings?: Partial<SurveyStrings>
  /** Portal parent. Default `document.body`, so it inherits `data-gf-theme`. */
  container?: HTMLElement
}

export interface SurveyWidget {
  destroy(): void
}

const NOOP: SurveyWidget = { destroy: () => undefined }

export function mountSurvey(
  controller: SurveyController,
  options: SurveyViewOptions = {},
): SurveyWidget {
  // SSR: nothing is created, nothing is registered, and the caller gets a
  // widget whose destroy() is safe to call.
  if (!isBrowser()) return NOOP

  injectStyles(SURVEY_CSS, SURVEY_STYLE_ID, options.nonce)
  retainStyles()

  const strings: SurveyStrings = { ...DEFAULT_STRINGS, ...options.strings }
  const container = options.container ?? document.body
  const els = buildSkeleton(strings)
  els.root.setAttribute('data-gf-dock', options.dock ?? 'bottom-end')

  let live: LiveRegion | null = null
  let mounted = false
  let previous: SurveyState | null = null
  /** Held while a tour runs, so the card never speaks over the renderer. */
  let pending = ''

  function ensureLive(): LiveRegion {
    live ??= createLiveRegion(nextId('gf-survey-live'))
    return live
  }

  els.dismiss.addEventListener('click', () => { void controller.dismiss() })
  els.submit.addEventListener('click', () => {
    void controller.submit(els.followUpInput.value)
  })

  /**
   * Escape closes it, but only while focus is inside.
   *
   * Scoped to the root and never to `document`: a docked surface that swallowed
   * Escape page-wide would eat the tour's own dismiss exactly when the user
   * most wants out.
   */
  els.root.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    if (!controller.getSnapshot().current?.dismissible) return
    if (!els.root.contains(document.activeElement)) return
    event.stopPropagation()
    void controller.dismiss()
  })

  function render(): void {
    const state = controller.getSnapshot()

    // Nothing paints until the first storage read resolves — otherwise a survey
    // this person answered last month flashes up and vanishes.
    const visible = state.hydrated && state.current !== null
    if (!visible || !state.current) {
      if (mounted) {
        els.root.remove()
        mounted = false
      }
      previous = state
      return
    }

    // The comment box is cleared when the question changes, never on an
    // ordinary re-render: rewriting `value` while someone is typing would eat
    // their words on every keystroke that triggers a derive.
    if (previous?.current?.id !== state.current.id) els.followUpInput.value = ''

    updateSurvey(els, state.current, strings, (score) => { controller.select(score) })
    setTourActive(els.root, state.tourActive)

    if (!mounted) {
      container.appendChild(els.root)
      mounted = true
    }

    announce(previous, state)
    previous = state
  }

  /**
   * Speak the question once, and the thanks when it arrives.
   *
   * Held while a tour is running and released on the falling edge, so the
   * card's polite utterance never collides with the renderer's step
   * announcement. The card is `visibility: hidden` during a tour anyway, so
   * speaking then would describe something unreachable.
   */
  function announce(before: SurveyState | null, after: SurveyState): void {
    if (!after.current) return

    const isNew = before?.current?.id !== after.current.id
    const nowThanking = after.current.phase === 'thanks' && before?.current?.phase !== 'thanks'
    if (!isNew && !nowThanking) return

    const message = nowThanking ? after.current.thanks : after.current.question
    if (after.tourActive) pending = message
    else ensureLive().announce(message)
  }

  // The falling edge of a tour: release whatever was held.
  function flushPending(state: SurveyState): void {
    if (previous?.tourActive && !state.tourActive && pending) {
      ensureLive().announce(pending)
      pending = ''
    }
  }

  const unsubscribe = controller.subscribe(() => {
    const state = controller.getSnapshot()
    flushPending(state)
    render()
  })
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
      if (releaseStyles()) removeStyles(SURVEY_STYLE_ID)
    },
  }
}
