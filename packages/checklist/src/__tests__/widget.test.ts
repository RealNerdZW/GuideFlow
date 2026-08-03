// ---------------------------------------------------------------------------
// Structure only.
//
// happy-dom has no layout engine: offsetParent is null for every element,
// getComputedStyle and getBoundingClientRect return zeros, and `inert` is not
// implemented. Tab order, focus restoration, docked position, RTL geometry,
// contrast, computed reduced-motion styles and z-order hit-testing are real
// only in apps/e2e/tests/checklist.spec.ts. `pnpm test` being green is not
// evidence for any of them.
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createChecklist } from '../controller.js'
import type { ChecklistDefinition } from '../types.js'
import { mountChecklist } from '../widget/index.js'
import { CHECKLIST_STYLE_ID } from '../widget/styles.js'

import { createMemoryDriver, flush, makeFlow } from './helpers.js'

const definition: ChecklistDefinition = {
  id: 'getting-started',
  title: 'Getting started',
  items: [
    { id: 'profile', title: 'Set up your profile', description: 'Add a photo', flowId: 'profile-tour' },
    { id: 'data', title: 'Connect your data' },
    { id: 'billing', title: 'Connect billing', requires: ['data'] },
  ],
}

function make(): GuideFlowInstance {
  return createGuideFlow({
    injectStyles: false,
    persistence: { driver: createMemoryDriver() },
    context: { userId: 'u1' },
  })
}

const root = (): HTMLElement | null => document.querySelector('.gf-checklist')
/**
 * The checklist's OWN region.
 *
 * `[role="status"]` alone also matches the renderer's, which is why the two
 * are separate elements with separate ids in the first place.
 */
const region = (): HTMLElement | null => document.querySelector('[id^="gf-checklist-live"]')

describe('mountChecklist', () => {
  let gf: GuideFlowInstance

  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  afterEach(() => {
    gf?.destroy()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders nothing until the first storage read resolves', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)

    // Otherwise the widget shows "0 of 3", jumps, and the live region
    // announces the flash.
    expect(root()).toBeNull()

    await flush()
    expect(root()).not.toBeNull()

    view.destroy()
    controller.destroy()
  })

  it('injects the stylesheet once, with the nonce', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller, { nonce: 'abc123' })
    await flush()

    const styles = document.head.querySelectorAll(`style[data-gf="${CHECKLIST_STYLE_ID}"]`)
    expect(styles).toHaveLength(1)
    expect(styles[0]?.getAttribute('nonce')).toBe('abc123')

    const second = mountChecklist(controller)
    await flush()
    expect(document.head.querySelectorAll(`style[data-gf="${CHECKLIST_STYLE_ID}"]`)).toHaveLength(1)

    // And the survivor keeps them. `injectStyles` de-dupes by id, so the second
    // mount injected nothing — and `destroy()` used to call `removeStyles`
    // unconditionally, stripping the stylesheet out from under the first mount.
    // Silently: no error, just an unstyled widget. This test mounted twice all
    // along and never checked, which is how it survived.
    second.destroy()
    expect(document.head.querySelectorAll(`style[data-gf="${CHECKLIST_STYLE_ID}"]`)).toHaveLength(1)

    view.destroy()
    expect(document.head.querySelector(`style[data-gf="${CHECKLIST_STYLE_ID}"]`)).toBeNull()
    controller.destroy()
  })

  it('wires the disclosure semantics', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    const launcher = document.querySelector('.gf-checklist-launcher')
    const panel = document.querySelector('.gf-checklist-panel')
    expect(launcher?.getAttribute('aria-expanded')).toBe('true')
    expect(launcher?.getAttribute('aria-controls')).toBe(panel?.id)

    const titleId = panel?.getAttribute('aria-labelledby')
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('Getting started')

    // Not a dialog: it is not modal, it does not trap, and claiming otherwise
    // is a promise to AT that the rest of the page is inert.
    expect(panel?.getAttribute('role')).toBeNull()
    expect(panel?.getAttribute('aria-modal')).toBeNull()

    view.destroy()
    controller.destroy()
  })

  it('reports progress as a count, not a bare percentage', async () => {
    gf = make()
    await gf.progress.markCompleted('u1', 'profile-tour')
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    const bar = document.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('1')
    expect(bar?.getAttribute('aria-valuemax')).toBe('3')
    expect(bar?.getAttribute('aria-valuetext')).toBe('1 of 3 complete')

    view.destroy()
    controller.destroy()
  })

  it('marks a blocked row aria-disabled and never disabled', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    const billing = document.querySelector('[data-item-id="billing"] button')
    // `disabled` would remove it from the tab order, and it could then never
    // announce which item unblocks it.
    expect(billing?.getAttribute('aria-disabled')).toBe('true')
    expect(billing?.hasAttribute('disabled')).toBe(false)

    const describedBy = billing?.getAttribute('aria-describedby')
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(
      'Complete Connect your data first',
    )

    view.destroy()
    controller.destroy()
  })

  it('a done row carries a glyph AND visually-hidden text, never colour alone', async () => {
    gf = make()
    await gf.progress.markCompleted('u1', 'profile-tour')
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    const row = document.querySelector('[data-item-id="profile"]')
    expect(row?.hasAttribute('data-gf-done')).toBe(true)
    expect(row?.querySelector('.gf-checklist-mark')?.textContent).toBe('✓')
    expect(row?.querySelector('.gf-checklist-sr')?.textContent).toBe('Completed')

    view.destroy()
    controller.destroy()
  })

  it('patches rows in place rather than rebuilding them', async () => {
    // Node identity across renders is what lets focus return to a row after
    // the tour it launched finishes.
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    const before = document.querySelector('[data-item-id="data"]')
    await controller.complete('data')
    expect(document.querySelector('[data-item-id="data"]')).toBe(before)

    view.destroy()
    controller.destroy()
  })

  it('goes inert and hidden while a tour runs', async () => {
    gf = make()
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    await gf.start('profile-tour')
    // Both halves together: visibility:hidden (via the attribute the
    // stylesheet keys on) removes the subtree from the tab order and the a11y
    // tree; inert covers pointer and programmatic focus.
    expect(root()?.hasAttribute('data-gf-tour-active')).toBe(true)
    expect(root()?.hasAttribute('inert')).toBe(true)

    await gf.next()
    await flush()
    expect(root()?.hasAttribute('data-gf-tour-active')).toBe(false)

    view.destroy()
    controller.destroy()
  })

  it('unmounts once dismissed', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    await controller.dismiss()
    expect(root()).toBeNull()

    view.destroy()
    controller.destroy()
  })

  it('collapses through the launcher', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    const launcher = document.querySelector<HTMLButtonElement>('.gf-checklist-launcher')
    launcher?.click()
    await flush()

    expect(launcher?.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector<HTMLElement>('.gf-checklist-panel')?.hidden).toBe(true)

    view.destroy()
    controller.destroy()
  })

  it('activates an item from its row, and ignores a blocked one', async () => {
    gf = make()
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    document.querySelector<HTMLButtonElement>('[data-item-id="billing"] button')?.click()
    await flush()
    expect(gf.isActive).toBe(false)

    document.querySelector<HTMLButtonElement>('[data-item-id="profile"] button')?.click()
    await flush()
    expect(gf.flowId).toBe('profile-tour')

    view.destroy()
    controller.destroy()
  })

  it('destroy() removes the root, the live region and the stylesheet', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()
    await controller.complete('data')
    await flush()

    view.destroy()

    expect(root()).toBeNull()
    expect(region()).toBeNull()
    expect(document.head.querySelector(`style[data-gf="${CHECKLIST_STYLE_ID}"]`)).toBeNull()
    controller.destroy()
  })

  it('announces the aggregate, once, outside the panel', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    await controller.complete('data')
    await flush()

    const live = region()
    expect(live?.getAttribute('role')).toBe('status')
    expect(live?.getAttribute('aria-live')).toBe('polite')
    expect(live?.getAttribute('aria-atomic')).toBe('true')
    // Outside the panel, so it outlives a collapse; visually hidden by
    // clipping, never display:none or visibility:hidden — both of which would
    // remove it from the accessibility tree.
    expect(live?.closest('.gf-checklist-panel')).toBeNull()
    const style = live?.getAttribute('style') ?? ''
    expect(style).toContain('position: absolute')
    expect(style).not.toContain('display: none')
    expect(style).not.toContain('visibility: hidden')
    expect(live?.textContent).toBe('Connect your data, completed. 1 of 3 complete')

    view.destroy()
    controller.destroy()
  })

  it('says nothing on the hydration transition', async () => {
    gf = make()
    await gf.progress.markCompleted('u1', 'profile-tour')
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    // Three items go from unknown to one-done in a single frame. That is what
    // `hydrated` is for; announcing it would narrate a flash.
    expect(region()).toBeNull()

    view.destroy()
    controller.destroy()
  })

  it('holds an announcement while a tour runs and flushes it after', async () => {
    gf = make()
    gf.createFlow(makeFlow('profile-tour'))
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller)
    await flush()

    await gf.start('profile-tour')
    await controller.complete('data')
    await flush()
    // The renderer owns the announcement channel while it is on screen.
    expect(region()?.textContent ?? '').toBe('')

    await gf.next()
    await flush()
    expect(region()?.textContent).toContain('Connect your data')

    view.destroy()
    controller.destroy()
  })

  it('takes custom strings', async () => {
    gf = make()
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller, {
      strings: { launcher: 'Erste Schritte', progressText: '{done} von {total}' },
    })
    await flush()

    expect(document.querySelector('.gf-checklist-launcher')?.textContent).toContain('Erste Schritte')
    expect(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe(
      '0 von 3',
    )

    view.destroy()
    controller.destroy()
  })

  it('is a no-op with no document, and hands back a safe view', async () => {
    // core is imported by Nuxt, Next and SvelteKit users. Nothing here may
    // touch document at module scope or during mount on the server.
    gf = make()
    const controller = createChecklist(gf, definition)
    await flush()

    vi.stubGlobal('document', undefined)
    let view: { destroy(): void }
    try {
      view = mountChecklist(controller)
    } finally {
      vi.unstubAllGlobals()
    }

    expect(() => view.destroy()).not.toThrow()
    expect(root()).toBeNull()
    controller.destroy()
  })

  it('honours the dock and the container', async () => {
    gf = make()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const controller = createChecklist(gf, definition)
    const view = mountChecklist(controller, { dock: 'top-start', container: host })
    await flush()

    expect(host.querySelector('.gf-checklist')?.getAttribute('data-gf-dock')).toBe('top-start')

    view.destroy()
    controller.destroy()
  })
})
