import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createBanners } from '../controller.js'
import { SUFFIX } from '../store.js'
import type { BannerController, BannerDefinition, BannerEvent } from '../types.js'

function banner(id: string, extra: Partial<BannerDefinition> = {}): BannerDefinition {
  return { id, title: `Title ${id}`, ...extra }
}

const TOUR: Parameters<GuideFlowInstance['createFlow']>[0] = {
  id: 'a-tour',
  initial: 'main',
  states: { main: { steps: [{ id: 's1', content: { title: 'Step' } }], final: true } },
}

/** Resolve the controller's floating hydrate() before asserting. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5))
}

/**
 * Poll until `check` stops throwing.
 *
 * The route watcher arms behind a dynamic `import('@guideflow/core/navigation')`,
 * which is deliberately lazy so a consumer with no url-scoped banner never
 * pulls that subpath in. A fixed sleep is therefore a race: it passed alone and
 * failed under `turbo`, where nine other packages are competing for the
 * machine. Poll for the condition instead of guessing how long it takes.
 */
async function waitFor(check: () => void, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      check()
      return
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((r) => setTimeout(r, 10))
    }
  }
}

describe('createBanners', () => {
  let gf: GuideFlowInstance
  let banners: BannerController | null = null

  beforeEach(() => {
    localStorage.clear()
    gf = createGuideFlow({ injectStyles: false, context: { userId: 'u1' } })
  })

  afterEach(() => {
    banners?.destroy()
    banners = null
    gf.destroy()
  })

  it('paints nothing until storage answers', () => {
    banners = createBanners(gf, [banner('a')])
    // Synchronously after construction the first read has not resolved.
    expect(banners.getSnapshot().hydrated).toBe(false)
    expect(banners.getSnapshot().current).toBeNull()
  })

  it('shows the highest-priority eligible banner once hydrated', async () => {
    banners = createBanners(gf, [
      banner('low', { targeting: { priority: 1 } }),
      banner('high', { targeting: { priority: 5 } }),
    ])
    await settle()

    const state = banners.getSnapshot()
    expect(state.hydrated).toBe(true)
    expect(state.current?.id).toBe('high')
    expect(state.queued).toBe(1)
  })

  it('getSnapshot is referentially stable while nothing changed', async () => {
    // A fresh object on every call is an infinite render loop in React.
    banners = createBanners(gf, [banner('a')])
    await settle()
    expect(banners.getSnapshot()).toBe(banners.getSnapshot())
    expect(banners.getSnapshot().current).toBe(banners.getSnapshot().current)
  })

  it('getServerSnapshot is idle and frozen, so SSR and hydration agree', () => {
    banners = createBanners(gf, [banner('a')])
    const ssr = banners.getServerSnapshot()
    expect(ssr.hydrated).toBe(false)
    expect(ssr.current).toBeNull()
    expect(Object.isFrozen(ssr)).toBe(true)
  })

  it('dismissing reveals the next one', async () => {
    banners = createBanners(gf, [
      banner('first', { targeting: { priority: 5 } }),
      banner('second', { targeting: { priority: 1 } }),
    ])
    await settle()
    expect(banners.getSnapshot().current?.id).toBe('first')

    await banners.dismiss('first')
    expect(banners.getSnapshot().current?.id).toBe('second')
    expect(banners.getSnapshot().queued).toBe(0)
  })

  it('a dismissal persists under its own suffix and touches nothing else', async () => {
    await gf.progress.markCompleted('u1', 'some-flow')
    banners = createBanners(gf, [banner('a')])
    await settle()
    await banners.dismiss('a')

    expect(await gf.progress.getRecord('u1', SUFFIX)).toMatchObject({ v: 1 })
    // The three suffixes a careless write would have clobbered.
    expect(await gf.progress.getCompletedFlows('u1')).toEqual(['some-flow'])
  })

  it('a dismissed banner does not come back on a fresh controller', async () => {
    banners = createBanners(gf, [banner('a')])
    await settle()
    await banners.dismiss('a')
    banners.destroy()

    banners = createBanners(gf, [banner('a')])
    await settle()
    expect(banners.getSnapshot().current).toBeNull()
  })

  it('changing an author-declared version brings it back', async () => {
    banners = createBanners(gf, [banner('a', { version: 1 })])
    await settle()
    await banners.dismiss('a')
    banners.destroy()

    banners = createBanners(gf, [banner('a', { version: 2 })])
    await settle()
    expect(banners.getSnapshot().current?.id).toBe('a')
  })

  it('with no identity nothing is written, and the dismissal is session-only', async () => {
    const anon = createGuideFlow({ injectStyles: false })
    const local = createBanners(anon, [banner('a')])
    await settle()
    expect(local.getSnapshot().persisted).toBe(false)

    await local.dismiss('a')
    expect(local.getSnapshot().current).toBeNull()
    expect(localStorage.length).toBe(0)

    local.destroy()
    anon.destroy()
  })

  it('reset clears stored dismissals and brings banners back', async () => {
    banners = createBanners(gf, [banner('a')])
    await settle()
    await banners.dismiss('a')
    expect(banners.getSnapshot().current).toBeNull()

    await banners.reset()
    expect(banners.getSnapshot().current?.id).toBe('a')
  })

  it('setBanners replaces the set without recording a dismissal', async () => {
    banners = createBanners(gf, [banner('a')])
    await settle()
    banners.setBanners([banner('b')])

    expect(banners.getSnapshot().current?.id).toBe('b')
    // Dropping an id is not the same as the user closing it.
    expect(await gf.progress.getRecord('u1', SUFFIX)).toBeNull()
  })

  it('evaluate() explains why nothing is showing', async () => {
    banners = createBanners(gf, [
      banner('scoped', { targeting: { audience: { where: { plan: 'pro' } } } }),
    ])
    await settle()
    expect(banners.getSnapshot().current).toBeNull()

    const [result] = banners.evaluate()
    expect(result?.eligible).toBe(false)
    expect(result?.blockedBy).toEqual(['audience'])
  })

  // ── Tour interaction ─────────────────────────────────────────────────────

  it('goes inert while a tour runs, and comes back after', async () => {
    gf.createFlow(TOUR)
    banners = createBanners(gf, [banner('a')])
    await settle()
    expect(banners.getSnapshot().tourActive).toBe(false)

    await gf.start('a-tour')
    expect(banners.getSnapshot().tourActive).toBe(true)
    expect(banners.getSnapshot().current?.id).toBe('a')

    gf.stop()
    await settle()
    expect(banners.getSnapshot().tourActive).toBe(false)
  })

  it('an action that starts a flow never interrupts a running tour', async () => {
    // gf.start() ends a running tour first, which emits tour:abandon —
    // analytics would log that as the user giving up.
    gf.createFlow(TOUR)
    gf.createFlow({ ...TOUR, id: 'other' })
    banners = createBanners(gf, [
      banner('a', { actions: [{ label: 'Go', flowId: 'other' }] }),
    ])
    await settle()

    await gf.start('a-tour')
    await banners.select(0)
    expect(gf.flowId).toBe('a-tour')
  })

  it('emits show, action and dismiss on the host callback, not the tour bus', async () => {
    const events: BannerEvent[] = []
    const tourEvents: string[] = []
    gf.on('tour:dismiss', () => tourEvents.push('tour:dismiss'))
    gf.on('tour:abandon', () => tourEvents.push('tour:abandon'))

    banners = createBanners(gf, [banner('a', { actions: [{ label: 'Go', dismisses: true }] })], {
      onEvent: (e) => events.push(e),
    })
    await settle()
    await banners.select(0)

    expect(events.map((e) => e.type)).toEqual(['show', 'action', 'dismiss'])
    // The third documented gap: a banner dismissal must not land in the tour
    // funnel alongside users giving up on a tour.
    expect(tourEvents).toEqual([])
  })

  it('a throwing onEvent is isolated', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    banners = createBanners(gf, [banner('a')], {
      onEvent: () => {
        throw new Error('host bug')
      },
    })
    await settle()

    expect(banners.getSnapshot().current?.id).toBe('a')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  // ── Identity ─────────────────────────────────────────────────────────────

  it('anonymousId mints an identifier so dismissals survive a reload', async () => {
    const anon = createGuideFlow({ injectStyles: false })
    const local = createBanners(anon, [banner('a')], { anonymousId: true })
    await settle()
    expect(local.getSnapshot().persisted).toBe(true)

    await local.dismiss('a')
    expect(localStorage.getItem('gf:banner-anon-id')).toMatch(/^anon-/)
    local.destroy()

    const again = createBanners(anon, [banner('a')], { anonymousId: true })
    await settle()
    expect(again.getSnapshot().current).toBeNull()
    again.destroy()
    anon.destroy()
  })

  it('uses its own anon key, never the checklist’s or targeting’s', async () => {
    // None of the three is swept by resetUser(), which only sweeps the keyFn
    // prefix. Sharing a key would resurrect an identity the host opted into
    // for a different surface.
    const anon = createGuideFlow({ injectStyles: false })
    const local = createBanners(anon, [banner('a')], { anonymousId: true })
    await settle()

    expect(localStorage.getItem('gf:anon-id')).toBeNull()
    expect(localStorage.getItem('gf:checklist-anon-id')).toBeNull()
    local.destroy()
    anon.destroy()
  })

  // ── Route scoping ────────────────────────────────────────────────────────

  it('re-derives on a route change when a banner is url-scoped', async () => {
    const start = window.location.href
    /* eslint-disable-next-line @typescript-eslint/unbound-method -- identity
       comparison only; nothing is invoked detached. */
    const pristinePushState = history.pushState
    banners = createBanners(gf, [
      banner('scoped', { targeting: { urlPattern: '**/only-here*' } }),
    ])
    await settle()
    expect(banners.getSnapshot().current).toBeNull()

    // A hash change is the one real route change happy-dom can produce, and
    // `watchHistory` hears it. pushState coverage lives in apps/e2e.
    // Wait for the watcher to be armed before producing the route change, or
    // the change lands before anyone is listening.
    await waitFor(() => {
      /* eslint-disable-next-line @typescript-eslint/unbound-method -- identity
         comparison is the assertion; nothing is invoked detached. */
      expect(history.pushState).not.toBe(pristinePushState)
    })
    // Captured: `banners` is a `let` the afterEach reassigns, so TypeScript
    // cannot narrow it inside a closure.
    const live = banners
    window.location.hash = '#/only-here'
    await waitFor(() => {
      expect(live.getSnapshot().current?.id).toBe('scoped')
    })

    window.location.href = start
  })

  it('arms the route watcher only when something declares a urlPattern', async () => {
    /* eslint-disable @typescript-eslint/unbound-method -- identity comparison
       is the assertion; nothing is invoked detached. */
    const pristine = history.pushState
    banners = createBanners(gf, [banner('plain')])
    await settle()
    // Nothing url-scoped: history is left alone, because patching it for every
    // consumer would be a page-global side effect taken for nothing.
    expect(history.pushState).toBe(pristine)

    banners.setBanners([banner('scoped', { targeting: { urlPattern: '/x/**' } })])
    await waitFor(() => {
      expect(history.pushState).not.toBe(pristine)
    })

    banners.destroy()
    banners = null
    expect(history.pushState).toBe(pristine)
    /* eslint-enable @typescript-eslint/unbound-method */
  })

  it('refresh() re-reads storage', async () => {
    banners = createBanners(gf, [banner('a')])
    await settle()
    expect(banners.getSnapshot().current?.id).toBe('a')

    // A dismissal written behind the controller's back — another tab, or the
    // host clearing state directly.
    await gf.progress.setRecord('u1', 'banner', { v: 1, dismissed: { a: { at: 1 } } })
    await banners.refresh()
    expect(banners.getSnapshot().current).toBeNull()
  })

  it('select() is a no-op for an index that does not exist', async () => {
    banners = createBanners(gf, [banner('a', { actions: [{ label: 'Only' }] })])
    await settle()
    await expect(banners.select(5)).resolves.toBeUndefined()
    expect(banners.getSnapshot().current?.id).toBe('a')
  })

  it('dismiss() ignores an unknown banner id', async () => {
    banners = createBanners(gf, [banner('a')])
    await settle()
    await banners.dismiss('not-registered')
    expect(banners.getSnapshot().current?.id).toBe('a')
  })

  it('destroy() releases the tour listeners', async () => {
    gf.createFlow(TOUR)
    banners = createBanners(gf, [banner('a')])
    await settle()
    banners.destroy()

    await gf.start('a-tour')
    // Frozen at the last state rather than tracking the tour.
    expect(banners.getSnapshot().tourActive).toBe(false)
    banners = null
  })
})
