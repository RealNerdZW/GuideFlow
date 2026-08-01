// ---------------------------------------------------------------------------
// DOM construction and in-place patching.
//
// Built entirely with createElement + textContent, never innerHTML. That is not
// caution about a specific input — it removes the escaping surface altogether,
// rather than re-implementing core's `_esc` in a second place.
//
// The list is PATCHED, keyed by data-item-id, never rebuilt. Node identity
// across renders is what lets focus return to a row after the tour it launched
// finishes.
// ---------------------------------------------------------------------------

import type { ChecklistItemState, ChecklistState } from '../types.js'

export interface ChecklistStrings {
  /** Accessible name for the collapsed launcher. */
  launcher: string
  /** Template with {done} and {total}. */
  progressText: string
  progressLabel: string
  expand: string
  collapse: string
  dismiss: string
  /** Visually-hidden suffix on a done row. */
  completed: string
  /** Template with {title} — the aria-describedby text on a blocked row. */
  blocked: string
}

export const DEFAULT_STRINGS: ChecklistStrings = {
  launcher: 'Getting started',
  progressText: '{done} of {total} complete',
  progressLabel: 'Checklist progress',
  expand: 'Show checklist',
  collapse: 'Hide checklist',
  dismiss: 'Dismiss checklist',
  completed: 'Completed',
  blocked: 'Complete {title} first',
}

export function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)
}

export interface ChecklistElements {
  root: HTMLDivElement
  launcher: HTMLButtonElement
  launcherCount: HTMLSpanElement
  panel: HTMLElement
  title: HTMLHeadingElement
  progress: HTMLDivElement
  progressFill: HTMLDivElement
  list: HTMLUListElement
  dismiss: HTMLButtonElement
}

/** Mint ids that cannot collide with core's `gf-N` counter or another mount. */
let _seq = 0
export function nextId(prefix: string): string {
  _seq += 1
  return `${prefix}-${_seq}`
}

export function buildSkeleton(strings: ChecklistStrings): ChecklistElements {
  const panelId = nextId('gf-checklist-panel')
  const titleId = nextId('gf-checklist-title')

  const root = document.createElement('div')
  root.className = 'gf-checklist'
  root.setAttribute('data-gf-checklist', '')

  const launcher = document.createElement('button')
  launcher.type = 'button'
  launcher.className = 'gf-checklist-launcher'
  launcher.setAttribute('aria-controls', panelId)
  const launcherLabel = document.createElement('span')
  launcherLabel.textContent = strings.launcher
  const launcherCount = document.createElement('span')
  launcherCount.className = 'gf-checklist-count'
  launcher.append(launcherLabel, launcherCount)

  const panel = document.createElement('section')
  panel.className = 'gf-checklist-panel'
  panel.id = panelId
  panel.setAttribute('aria-labelledby', titleId)

  const title = document.createElement('h2')
  title.className = 'gf-checklist-title'
  title.id = titleId
  title.tabIndex = -1

  // A progressbar, not a meter: this is task completion over time, and
  // aria-valuetext carries the count so AT reads "3 of 5 complete" rather than
  // a bare percentage.
  const progress = document.createElement('div')
  progress.className = 'gf-checklist-progress'
  progress.setAttribute('role', 'progressbar')
  progress.setAttribute('aria-label', strings.progressLabel)
  progress.setAttribute('aria-valuemin', '0')
  const progressFill = document.createElement('div')
  progressFill.className = 'gf-checklist-progress-fill'
  progress.appendChild(progressFill)

  const list = document.createElement('ul')
  list.className = 'gf-checklist-items'

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'gf-checklist-dismiss'
  dismiss.textContent = strings.dismiss

  panel.append(title, progress, list, dismiss)
  root.append(launcher, panel)

  return { root, launcher, launcherCount, panel, title, progress, progressFill, list, dismiss }
}

/**
 * Reconcile the list against `items`, reusing every row whose id is unchanged.
 *
 * Rows are keyed on data-item-id and moved rather than recreated, so a row that
 * currently holds focus keeps it across a re-render.
 */
export function patchList(
  list: HTMLUListElement,
  items: readonly ChecklistItemState[],
  strings: ChecklistStrings,
  onActivate: (itemId: string) => void,
): void {
  const existing = new Map<string, HTMLLIElement>()
  for (const li of Array.from(list.children)) {
    const id = (li as HTMLElement).dataset['itemId']
    if (id !== undefined) existing.set(id, li as HTMLLIElement)
  }

  // A blocker is named by its title, never its id: the blocked row's
  // description is read aloud, and "Complete data first" is an internal
  // identifier leaking into an announcement.
  const titles = new Map(items.map((item) => [item.id, item.title]))

  let cursor: ChildNode | null = list.firstChild
  for (const item of items) {
    const row = existing.get(item.id) ?? createRow(item, onActivate)
    existing.delete(item.id)
    updateRow(row, item, strings, titles)
    if (row !== cursor) list.insertBefore(row, cursor)
    else cursor = cursor.nextSibling
  }
  for (const orphan of existing.values()) orphan.remove()
}

interface RowRefs {
  control: HTMLElement
  mark: HTMLSpanElement
  title: HTMLSpanElement
  desc: HTMLSpanElement
  status: HTMLSpanElement
  blocked: HTMLSpanElement
}

const rowRefs = new WeakMap<HTMLLIElement, RowRefs>()

function createRow(item: ChecklistItemState, onActivate: (itemId: string) => void): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'gf-checklist-item'
  li.dataset['itemId'] = item.id
  // Focusable programmatically but not by Tab: it exists so focus can be
  // restored to the row after the tour it launched ends.
  li.tabIndex = -1

  const control = document.createElement('button')
  control.type = 'button'
  control.className = 'gf-checklist-row'
  control.addEventListener('click', () => {
    if (control.getAttribute('aria-disabled') === 'true') return
    onActivate(item.id)
  })

  const mark = document.createElement('span')
  mark.className = 'gf-checklist-mark'
  mark.setAttribute('aria-hidden', 'true')

  const text = document.createElement('span')
  text.className = 'gf-checklist-text'
  const title = document.createElement('span')
  title.className = 'gf-checklist-item-title'
  const desc = document.createElement('span')
  desc.className = 'gf-checklist-item-desc'
  const status = document.createElement('span')
  status.className = 'gf-checklist-sr'
  const blocked = document.createElement('span')
  blocked.className = 'gf-checklist-sr'
  blocked.id = nextId('gf-checklist-blocked')

  text.append(title, desc, status)
  control.append(mark, text)
  li.append(control, blocked)

  rowRefs.set(li, { control, mark, title, desc, status, blocked })
  return li
}

function updateRow(
  li: HTMLLIElement,
  item: ChecklistItemState,
  strings: ChecklistStrings,
  titles: ReadonlyMap<string, string>,
): void {
  const refs = rowRefs.get(li)
  if (!refs) return

  li.toggleAttribute('data-gf-done', item.done)
  refs.title.textContent = item.title
  refs.desc.textContent = item.description ?? ''
  refs.desc.hidden = item.description === undefined
  // A glyph plus visually-hidden text — never colour alone, which forced-colors
  // and colour-blind users would both lose.
  refs.mark.textContent = item.done ? '✓' : ''
  refs.status.textContent = item.done ? strings.completed : ''

  const control = refs.control
  if (item.done) {
    // A done item is not a dead button: it is not a button at all. Core has no
    // clearCompleted, so a completed flow cannot be replayed, and rendering an
    // inert control would promise an action that silently does nothing.
    control.setAttribute('aria-disabled', 'true')
    control.tabIndex = -1
  } else {
    control.removeAttribute('aria-disabled')
    control.removeAttribute('tabindex')
  }

  if (!item.available && !item.done) {
    control.setAttribute('aria-disabled', 'true')
    const names = item.blockedBy.map((id) => titles.get(id) ?? id).join(', ')
    refs.blocked.textContent = format(strings.blocked, { title: names })
    control.setAttribute('aria-describedby', refs.blocked.id)
  } else {
    refs.blocked.textContent = ''
    control.removeAttribute('aria-describedby')
  }
}

export function updateChrome(
  els: ChecklistElements,
  state: ChecklistState,
  strings: ChecklistStrings,
): void {
  const counts = { done: String(state.doneCount), total: String(state.totalCount) }
  const progressText = format(strings.progressText, counts)

  els.title.textContent = state.title
  els.launcherCount.textContent = `${state.doneCount}/${state.totalCount}`
  els.launcher.setAttribute('aria-expanded', String(!state.collapsed))
  els.launcher.setAttribute('aria-label', state.collapsed ? strings.expand : strings.collapse)
  els.panel.hidden = state.collapsed

  els.progress.setAttribute('aria-valuenow', String(state.doneCount))
  els.progress.setAttribute('aria-valuemax', String(state.totalCount))
  els.progress.setAttribute('aria-valuetext', progressText)
  const pct = state.totalCount === 0 ? 0 : (state.doneCount / state.totalCount) * 100
  els.progressFill.style.inlineSize = `${pct}%`
  els.dismiss.textContent = strings.dismiss
}
