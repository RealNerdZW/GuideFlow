// ---------------------------------------------------------------------------
// The docked surface.
//
// happy-dom has no layout engine, so nothing here asserts geometry — that lives
// in apps/e2e. What is testable is structure, semantics, and teardown.
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createBanners } from '../controller.js'
import type { BannerController, BannerDefinition } from '../types.js'
import { mountBanner, type BannerWidget } from '../widget/index.js'

function banner(id: string, extra: Partial<BannerDefinition> = {}): BannerDefinition {
  return { id, title: `Title ${id}`, ...extra }
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5))
}

const root = (): HTMLElement | null => document.querySelector('.gf-banner')
const styleTags = (): number => document.querySelectorAll('style[data-gf="gf-banner"]').length

describe('mountBanner', () => {
  let gf: GuideFlowInstance
  let controller: BannerController | null = null
  let widget: BannerWidget | null = null

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    gf = createGuideFlow({ injectStyles: false, context: { userId: 'u1' } })
  })

  afterEach(() => {
    widget?.destroy()
    widget = null
    controller?.destroy()
    controller = null
    gf.destroy()
  })

  it('paints nothing before hydration, then renders the banner', async () => {
    controller = createBanners(gf, [banner('a', { body: 'Body text' })])
    widget = mountBanner(controller)
    expect(root()).toBeNull()

    await settle()
    expect(root()).not.toBeNull()
    expect(root()?.querySelector('.gf-banner-title')?.textContent).toBe('Title a')
    expect(root()?.querySelector('.gf-banner-body')?.textContent).toBe('Body text')
  })

  it('is a named landmark, not a dialog', async () => {
    // A region with no accessible name is not exposed as a landmark at all, so
    // the label is load-bearing. role="alert" would be assertive and cut a
    // running tour's step announcement in half; role="banner" is the page
    // header landmark and would displace the host's own.
    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller)
    await settle()

    expect(root()?.getAttribute('role')).toBe('region')
    expect(root()?.getAttribute('aria-label')).toBe('Announcement')
    expect(root()?.getAttribute('aria-modal')).toBeNull()
    expect(root()?.getAttribute('role')).not.toBe('alert')
  })

  it('renders the body as text, never as markup', async () => {
    controller = createBanners(gf, [banner('a', { body: '<img src=x onerror=alert(1)>' })])
    widget = mountBanner(controller)
    await settle()

    const body = root()?.querySelector('.gf-banner-body')
    expect(body?.querySelector('img')).toBeNull()
    expect(body?.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('hides the body element entirely when there is no body', async () => {
    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller)
    await settle()
    expect(root()?.querySelector<HTMLElement>('.gf-banner-body')?.hidden).toBe(true)
  })

  // Position is asserted RELATIVE TO THE PAGE CONTENT, not as first/last child
  // of body. The clipped live region is also a child of body and is appended
  // after the bar, so `body.lastElementChild` is the live region for a bottom
  // dock — a true fact about an element the user never sees, and not what
  // either of these tests is about.

  it('dock top inserts ahead of the page content, so DOM order matches visual order', async () => {
    // WCAG 1.3.2 Meaningful Sequence. Appending a visually-first bar last is
    // the classic way to ship a banner a screen reader meets on the way out.
    const other = document.createElement('main')
    document.body.appendChild(other)

    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller, { dock: 'top' })
    await settle()
    expect(root()?.nextElementSibling).toBe(other)
  })

  it('dock bottom inserts after the page content', async () => {
    const other = document.createElement('main')
    document.body.appendChild(other)

    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller, { dock: 'bottom' })
    await settle()
    expect(other.nextElementSibling).toBe(root())
    expect(root()?.getAttribute('data-gf-dock')).toBe('bottom')
  })

  it('the dismiss button removes the banner', async () => {
    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller)
    await settle()

    root()?.querySelector<HTMLButtonElement>('.gf-banner-dismiss')?.click()
    await settle()
    expect(root()).toBeNull()
  })

  it('hides the dismiss button when dismissible is false', async () => {
    controller = createBanners(gf, [banner('a', { dismissible: false })])
    widget = mountBanner(controller)
    await settle()
    expect(root()?.querySelector<HTMLElement>('.gf-banner-dismiss')?.hidden).toBe(true)
  })

  it('renders actions and routes clicks by index', async () => {
    let clicked = ''
    controller = createBanners(gf, [
      banner('a', {
        actions: [
          { label: 'First', onSelect: () => { clicked = 'First' } },
          { label: 'Second', variant: 'primary', onSelect: () => { clicked = 'Second' } },
        ],
      }),
    ])
    widget = mountBanner(controller)
    await settle()

    const buttons = root()?.querySelectorAll<HTMLButtonElement>('.gf-banner-action')
    expect(buttons).toHaveLength(2)
    expect(buttons?.[1]?.getAttribute('data-gf-variant')).toBe('primary')

    buttons?.[1]?.click()
    await settle()
    expect(clicked).toBe('Second')
  })

  it('Escape closes it only when focus is inside', async () => {
    // Scoped to the root and never to document: a docked surface that swallows
    // Escape page-wide would eat the tour's own dismiss.
    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller)
    await settle()

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(root()).not.toBeNull()

    root()?.querySelector<HTMLButtonElement>('.gf-banner-dismiss')?.focus()
    root()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(root()).toBeNull()
  })

  it('goes inert and hidden while a tour runs', async () => {
    gf.createFlow({
      id: 't',
      initial: 'm',
      states: { m: { steps: [{ id: 's', content: { title: 'S' } }], final: true } },
    })
    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller)
    await settle()
    expect(root()?.hasAttribute('inert')).toBe(false)

    await gf.start('t')
    await settle()
    expect(root()?.hasAttribute('inert')).toBe(true)
    expect(root()?.hasAttribute('data-gf-tour-active')).toBe(true)
  })

  it('announces through its own polite region, never on the surface itself', async () => {
    // role="status" on the container would re-announce the entire bar on every
    // mutation, including the queue advancing after a dismissal.
    controller = createBanners(gf, [banner('a', { body: 'Body' })])
    widget = mountBanner(controller)
    await settle()
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    const region = document.querySelector('[role="status"]')
    expect(region).not.toBeNull()
    expect(region?.parentElement).toBe(document.body)
    expect(region).not.toBe(root())
    expect(region?.textContent).toBe('Title a. Body')
  })

  it('SSR: mounting without a document is a no-op with a safe destroy', () => {
    // Guarded by isBrowser(), and nothing runs at module scope — core is
    // imported by Nuxt, Next and SvelteKit users.
    const doc = globalThis.document
    const win = globalThis.window
    try {
      // @ts-expect-error deliberately removing the globals
      delete globalThis.document
      // @ts-expect-error deliberately removing the globals
      delete globalThis.window
      const noop = mountBanner({} as BannerController)
      expect(() => noop.destroy()).not.toThrow()
    } finally {
      globalThis.document = doc
      globalThis.window = win
    }
  })

  // ── The stylesheet refcount ──────────────────────────────────────────────

  it('a second mount does not lose its styles when the first is destroyed', async () => {
    // `injectStyles` de-dupes by id, so the second mount injects nothing — and
    // an unconditional `removeStyles` in destroy() then strips the stylesheet
    // out from under it. Silently: no error, just an unstyled bar. This is a
    // live defect in @guideflow/checklist, fixed there in the same change.
    controller = createBanners(gf, [banner('a')])
    const first = mountBanner(controller)
    const second = mountBanner(controller)
    await settle()
    expect(styleTags()).toBe(1)

    first.destroy()
    expect(styleTags()).toBe(1)

    second.destroy()
    expect(styleTags()).toBe(0)
  })

  it('destroy() removes the surface and its live region', async () => {
    controller = createBanners(gf, [banner('a')])
    widget = mountBanner(controller)
    await settle()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(document.querySelector('[role="status"]')).not.toBeNull()

    widget.destroy()
    widget = null
    expect(root()).toBeNull()
    expect(document.querySelector('[role="status"]')).toBeNull()
    expect(styleTags()).toBe(0)
  })
})
