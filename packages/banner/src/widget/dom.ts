// ---------------------------------------------------------------------------
// The DOM. Built once, patched in place.
//
// Every text value goes in through `textContent`. There is no interpolation
// into `innerHTML` anywhere in this package, which is why it needs no escaping
// helper and no sanitiser — the escaping surface is removed rather than
// re-implemented for a third time. `BannerDefinition.body` is documented as
// plain text for exactly this reason.
// ---------------------------------------------------------------------------

import type { BannerAction, BannerView } from '../types.js'

export interface BannerStrings {
  /**
   * Accessible name for the landmark.
   *
   * A `role="region"` with no accessible name is not exposed as a landmark at
   * all, so this is not decorative — without it a screen-reader user cannot
   * jump to the bar, or back out of it.
   */
  region: string
  dismiss: string
}

export const DEFAULT_STRINGS: BannerStrings = {
  region: 'Announcement',
  dismiss: 'Dismiss',
}

let counter = 0
export function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export interface BannerElements {
  root: HTMLElement
  title: HTMLElement
  body: HTMLElement
  actions: HTMLElement
  dismiss: HTMLButtonElement
}

/**
 * The skeleton.
 *
 * `role="region"` — a landmark, so the bar is findable *after* it appears and
 * escapable once found. Explicitly not `role="banner"`: that is the page-header
 * landmark, there is one per page, and claiming it would displace the host's
 * own header. Explicitly not `role="alert"`: assertive, it would cut a running
 * tour's step announcement in half.
 */
export function buildSkeleton(strings: BannerStrings): BannerElements {
  const root = document.createElement('section')
  root.className = 'gf-banner'
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', strings.region)

  const content = document.createElement('div')
  content.className = 'gf-banner-content'

  const title = document.createElement('p')
  title.className = 'gf-banner-title'

  const body = document.createElement('p')
  body.className = 'gf-banner-body'

  content.append(title, body)

  const actions = document.createElement('div')
  actions.className = 'gf-banner-actions'

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'gf-banner-dismiss'
  dismiss.setAttribute('aria-label', strings.dismiss)
  dismiss.textContent = '×'

  root.append(content, actions, dismiss)
  return { root, title, body, actions, dismiss }
}

/**
 * Patch the chrome to match `view`.
 *
 * The action row is rebuilt rather than diffed. A banner has zero to two
 * actions and they change only when the queue advances to a different banner,
 * so a keyed patch would be more code guarding against a case that does not
 * arise — unlike the checklist's list, which is patched in place precisely
 * because its rows must survive a re-render to keep focus.
 */
export function updateBanner(
  els: BannerElements,
  view: BannerView,
  strings: BannerStrings,
  onSelect: (index: number) => void,
): void {
  els.root.setAttribute('data-gf-tone', view.tone)
  els.title.textContent = view.title

  els.body.textContent = view.body ?? ''
  els.body.hidden = view.body === undefined || view.body === ''

  els.dismiss.hidden = !view.dismissible
  els.dismiss.setAttribute('aria-label', strings.dismiss)

  els.actions.replaceChildren()
  view.actions.forEach((action: BannerAction, index: number) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'gf-banner-action'
    button.setAttribute('data-gf-variant', action.variant ?? 'secondary')
    button.textContent = action.label
    button.addEventListener('click', () => { onSelect(index) })
    els.actions.appendChild(button)
  })
  els.actions.hidden = view.actions.length === 0
}
