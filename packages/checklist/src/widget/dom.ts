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
  /**
   * Visually-hidden suffix on a done, flow-backed row — it can be replayed.
   *
   * Separate from `completed` because the two rows differ: a manually-ticked
   * item has nothing to re-run, and promising one an action would be the exact
   * dead-button problem this string exists to avoid.
   */
  replay: string
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
  replay: 'Completed — select to do it again',
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

  // Headings are derived from the values present, in first-appearance order,
  // with ungrouped rows first — so a heading cannot be declared for a group
  // that has no rows, and cannot go missing for one that does.
  const ordered = [
    ...items.filter((i) => i.group === null),
    ...items.filter((i) => i.group !== null),
  ]

  let cursor: ChildNode | null = list.firstChild
  let lastGroup: string | null = null
  for (const item of ordered) {
    if (item.group !== null && item.group !== lastGroup) {
      const key = `__group:${item.group}`
      const heading = existing.get(key) ?? createGroupHeading(item.group, key)
      existing.delete(key)
      if (heading !== cursor) list.insertBefore(heading, cursor)
      cursor = heading.nextSibling
    }
    lastGroup = item.group

    const kind = item.href !== null ? 'link' : 'action'
    const found = existing.get(item.id)
    // A row whose kind changed cannot be patched — a button cannot become an
    // anchor — so it is rebuilt rather than left as the wrong element.
    const reusable = found !== undefined && found.dataset['kind'] === kind ? found : undefined
    if (found !== undefined && reusable === undefined) found.remove()
    const row = reusable ?? createRow(item, onActivate)
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

/**
 * A section heading inside the list.
 *
 * `role="presentation"` on the `li` so it does not inflate the list's item
 * count — "17 items" when there are 15 tasks and 2 headings is a worse
 * experience than no heading at all. The `h3` inside keeps its heading
 * semantics, which is the entire reason to have one: someone can skim by
 * heading instead of reading fifteen rows.
 */
function createGroupHeading(label: string, key: string): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'gf-checklist-group'
  li.setAttribute('role', 'presentation')
  li.dataset['itemId'] = key
  const h = document.createElement('h3')
  h.className = 'gf-checklist-group-title'
  h.textContent = label
  li.append(h)
  return li
}

function createRow(item: ChecklistItemState, onActivate: (itemId: string) => void): HTMLLIElement {
  const li = document.createElement('li')
  li.className = 'gf-checklist-item'
  li.dataset['itemId'] = item.id
  // Focusable programmatically but not by Tab: it exists so focus can be
  // restored to the row after the tour it launched ends.
  li.tabIndex = -1

  // A link row is a real anchor, not a button that navigates. That is the
  // whole point of `href`: middle-click, ctrl-click, "copy link address" and
  // the `link` role all come from the element, and none of them can be
  // reproduced by a click handler. `href` is already scheme-checked in
  // `derive`, so a rejected one arrives as null and this branch is not taken.
  const isLink = item.href !== null
  const control: HTMLElement = isLink
    ? document.createElement('a')
    : document.createElement('button')
  control.className = 'gf-checklist-row'
  li.dataset['kind'] = isLink ? 'link' : 'action'

  if (control instanceof HTMLAnchorElement) {
    control.href = item.href as string
    // Same-tab by default; a help centre that always steals a new tab is as
    // annoying as one that never does. The author controls it with `target` on
    // their own wrapper if they need to.
    control.addEventListener('click', () => { onActivate(item.id) })
  } else {
    (control as HTMLButtonElement).type = 'button'
    control.addEventListener('click', () => {
      if (control.getAttribute('aria-disabled') === 'true') return
      onActivate(item.id)
    })
  }

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

  const control = refs.control
  // A done row used to be inert, and the reason was true when it was written:
  // "core has no clearCompleted, so a completed flow cannot be replayed, and
  // rendering an inert control would promise an action that silently does
  // nothing". Both halves have since stopped being true — `clearCompleted`
  // landed in 7.10b, and `start(flow, ctx, { force: true })` in ADR-021 is the
  // better mechanism because it writes nothing and so cannot un-tick this very
  // row. So a flow-backed done item is a live control again.
  //
  // A MANUALLY ticked item still is not: there is no flow to re-run, and that
  // is the dead button the original comment was right about.
  const replayable = item.done && item.flowId !== null
  refs.status.textContent = item.done ? (replayable ? strings.replay : strings.completed) : ''

  if (item.done && !replayable) {
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

/** What the definition turns off. Both default on. */
export interface ChromeOptions {
  showProgress?: boolean
  dismissible?: boolean
}

export function updateChrome(
  els: ChecklistElements,
  state: ChecklistState,
  strings: ChecklistStrings,
  chrome: ChromeOptions = {},
): void {
  const counts = { done: String(state.doneCount), total: String(state.totalCount) }
  const progressText = format(strings.progressText, counts)
  const showProgress = chrome.showProgress !== false
  const dismissible = chrome.dismissible !== false

  els.title.textContent = state.title
  els.launcher.setAttribute('aria-expanded', String(!state.collapsed))
  els.launcher.setAttribute('aria-label', state.collapsed ? strings.expand : strings.collapse)
  els.panel.hidden = state.collapsed

  // Removed from the accessibility tree, not just hidden. A list of help
  // articles has no completion to report, and `role="progressbar"` over one is
  // a lie an assistive technology reads out as a percentage.
  els.progress.hidden = !showProgress
  els.launcherCount.hidden = !showProgress
  if (showProgress) {
    els.launcherCount.textContent = `${state.doneCount}/${state.totalCount}`
    els.progress.setAttribute('aria-valuenow', String(state.doneCount))
    els.progress.setAttribute('aria-valuemax', String(state.totalCount))
    els.progress.setAttribute('aria-valuetext', progressText)
    const pct = state.totalCount === 0 ? 0 : (state.doneCount / state.totalCount) * 100
    els.progressFill.style.inlineSize = `${pct}%`
  } else {
    els.launcherCount.textContent = ''
  }

  // A help launcher must not be dismissable: the user summoned it, and there is
  // nothing to get out of the way.
  els.dismiss.hidden = !dismissible
  els.dismiss.textContent = strings.dismiss
}
