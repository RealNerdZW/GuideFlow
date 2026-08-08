// ---------------------------------------------------------------------------
// SPA route-change handling — the last open P0.
//
// A grep for popstate, pushState, hashchange, the Navigation API or any router
// integration across the monorepo used to return zero hits. TourEngine resolved
// each step's target once with querySelector, waited 150 ms and rendered — so a
// step whose target lived on /settings while the tour started on /dashboard
// resolved to null and rendered as a centred modal with no spotlight, silently
// (AUDIT `no-spa-route-change-handling`).
//
// happy-dom has no layout engine, so everything visual is in apps/e2e. What is
// testable here is the contract: what the engine asks an adapter for, when it
// gives up, and what it tears down.
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/unbound-method -- asserting on spied
   renderer methods is the point; nothing here is invoked detached. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { TourEngine } from '../engine/tour.js'
import { matchRoute } from '../navigation/route.js'
import { waitForElement } from '../navigation/wait.js'
import type {
  FlowDefinition,
  NavigationAdapter,
  RendererContract,
  ResolveTargetRequest,
  ResolveTargetResult,
} from '../types/index.js'

function createMockRenderer(): RendererContract & { setWaiting: ReturnType<typeof vi.fn> } {
  return {
    renderStep: vi.fn(),
    hideStep: vi.fn(),
    setWaiting: vi.fn(),
    renderHotspot: vi.fn(),
    destroyHotspot: vi.fn(),
    renderHint: vi.fn(),
    destroyHints: vi.fn(),
  }
}

const routedFlow: FlowDefinition = {
  id: 'routed',
  initial: 'dashboard',
  states: {
    dashboard: {
      steps: [{ id: 'd1', target: '#on-dashboard', content: { title: 'Dashboard' } }],
      on: { NEXT: 'settings' },
      route: '/dashboard',
    },
    settings: {
      steps: [{ id: 's1', target: '#on-settings', content: { title: 'Settings' } }],
      final: true,
      route: '/settings',
    },
  },
}

// ── matchRoute ──────────────────────────────────────────────────────────────

describe('matchRoute', () => {
  const at = (path: string): URL => new URL(`https://app.test${path}`)

  it('anchors, so /user does not match /users/42', () => {
    // The whole reason this is not `url.startsWith(route)`. An unanchored
    // matcher would believe the tour is already on the right page and never
    // wait or navigate.
    expect(matchRoute('/user', at('/users/42'))).toBe(false)
    expect(matchRoute('/user', at('/user'))).toBe(true)
  })

  it('matches one segment with *', () => {
    expect(matchRoute('/app/*', at('/app/billing'))).toBe(true)
    expect(matchRoute('/app/*', at('/app/billing/invoices'))).toBe(false)
  })

  it('matches any number of segments with **', () => {
    expect(matchRoute('/app/**', at('/app/billing'))).toBe(true)
    expect(matchRoute('/app/**', at('/app/billing/invoices'))).toBe(true)
  })

  it('treats regex metacharacters in a pattern literally', () => {
    // `/v1.0/docs` must not match `/v1X0/docs`.
    expect(matchRoute('/v1.0/docs', at('/v1.0/docs'))).toBe(true)
    expect(matchRoute('/v1.0/docs', at('/v1X0/docs'))).toBe(false)
  })

  it('matches against pathname+search+hash when the pattern has a hash', () => {
    // Which is what makes hash routers work with no special case.
    expect(matchRoute('/#/settings/*', at('/#/settings/profile'))).toBe(true)
    expect(matchRoute('/#/settings/*', at('/#/billing'))).toBe(false)
  })

  it('accepts a RegExp', () => {
    expect(matchRoute(/^\/app\/\d+$/, at('/app/42'))).toBe(true)
    expect(matchRoute(/^\/app\/\d+$/, at('/app/x'))).toBe(false)
  })

  it('accepts a predicate and hands it a URL', () => {
    const seen: URL[] = []
    matchRoute((url) => {
      seen.push(url)
      return true
    }, at('/anything?q=1'))
    expect(seen[0]?.searchParams.get('q')).toBe('1')
  })

  it('does not carry lastIndex between calls on a /g pattern', () => {
    const re = /\/app/g
    expect(matchRoute(re, at('/app'))).toBe(true)
    expect(matchRoute(re, at('/app'))).toBe(true)
  })
})

// ── waitForElement ──────────────────────────────────────────────────────────

describe('waitForElement', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves immediately when the element already exists', async () => {
    const el = document.createElement('div')
    el.id = 'here'
    document.body.appendChild(el)

    await expect(waitForElement('#here')).resolves.toBe(el)
  })

  it('resolves when the element appears later', async () => {
    const promise = waitForElement('#later', { timeoutMs: 2000 })

    setTimeout(() => {
      const el = document.createElement('div')
      el.id = 'later'
      document.body.appendChild(el)
    }, 20)

    const found = await promise
    expect((found as HTMLElement | null)?.id).toBe('later')
  })

  it('resolves null on the deadline rather than rejecting', async () => {
    // A step that cannot find its target is a rendering decision, not an
    // exception — the engine emits step:timeout and renders unanchored.
    await expect(waitForElement('#never', { timeoutMs: 30 })).resolves.toBeNull()
  })

  it('resolves null immediately on abort, not at the deadline', async () => {
    const controller = new AbortController()
    const started = Date.now()
    const promise = waitForElement('#never', { timeoutMs: 5000, signal: controller.signal })

    controller.abort()
    await expect(promise).resolves.toBeNull()
    // Would be ~5000 if abort merely marked a flag.
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('resolves null for an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      waitForElement('#never', { timeoutMs: 5000, signal: controller.signal }),
    ).resolves.toBeNull()
  })

  it('searches inside a supplied root', async () => {
    const root = document.createElement('div')
    const child = document.createElement('span')
    child.className = 'scoped'
    root.appendChild(child)
    document.body.appendChild(root)

    const outside = document.createElement('span')
    outside.className = 'scoped'
    document.body.appendChild(outside)

    await expect(waitForElement('.scoped', { root })).resolves.toBe(child)
  })
})

// ── The engine seam ─────────────────────────────────────────────────────────

describe('the engine seam', () => {
  let engine: TourEngine
  let renderer: ReturnType<typeof createMockRenderer>

  beforeEach(() => {
    renderer = createMockRenderer()
  })

  afterEach(() => {
    engine?.destroy()
    document.body.innerHTML = ''
  })

  /** An adapter whose resolution the test drives. */
  function stubAdapter(
    impl?: (req: ResolveTargetRequest) => Promise<ResolveTargetResult>,
  ): NavigationAdapter & {
    requests: ResolveTargetRequest[]
    attachCalls: { count: number }
    destroyCalls: { count: number }
    fire: () => void
  } {
    let onChange: (() => void) | null = null
    const requests: ResolveTargetRequest[] = []
    // Plain counters rather than vi.fn(): a mock widens the method's signature
    // to `Mock<any[], unknown>`, which no longer satisfies NavigationAdapter.
    const attachCalls = { count: 0 }
    const destroyCalls = { count: 0 }
    return {
      requests,
      resolveTarget(req) {
        requests.push(req)
        return impl ? impl(req) : Promise.resolve({ target: null })
      },
      attachCalls,
      destroyCalls,
      attach(fn: () => void) {
        attachCalls.count++
        onChange = fn
        return () => { onChange = null }
      },
      destroy() {
        destroyCalls.count++
        onChange = null
      },
      fire: () => { onChange?.() },
    }
  }

  it('hands the adapter the state node, so route is reachable', async () => {
    const adapter = stubAdapter()
    engine = new TourEngine({ renderer, navigation: adapter })
    await engine.start(routedFlow)

    expect(adapter.requests).toHaveLength(1)
    // The whole argument for state-level routes: the adapter needs the node,
    // not just the step.
    expect(adapter.requests[0]?.state.route).toBe('/dashboard')
    expect(adapter.requests[0]?.step.id).toBe('d1')
    expect(adapter.requests[0]?.direction).toBe('forward')
    expect(adapter.requests[0]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports backward direction on prev()', async () => {
    const adapter = stubAdapter()
    engine = new TourEngine({ renderer, navigation: adapter })
    await engine.start({
      id: 'two',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 'a', content: { title: 'A' } },
            { id: 'b', content: { title: 'B' } },
          ],
          final: true,
        },
      },
    })
    await engine.next()
    await engine.prev()

    expect(adapter.requests.at(-1)?.direction).toBe('backward')
  })

  it('marks the renderer busy without unmounting it', async () => {
    // The Phase 6.1 regression guard: hideStep() restores focus to the pre-tour
    // element and then nulls it, and removes the live region.
    const adapter = stubAdapter((req) => {
      req.onWaiting('route')
      return Promise.resolve({ target: null })
    })
    engine = new TourEngine({ renderer, navigation: adapter })

    const waiting: string[] = []
    engine.on('step:waiting', (e) => waiting.push(`${e.stepId}:${e.reason}`))

    await engine.start(routedFlow)

    expect(waiting).toEqual(['d1:route'])
    expect(renderer.setWaiting).toHaveBeenCalledWith(true, expect.objectContaining({ id: 'd1' }))
    expect(renderer.setWaiting).toHaveBeenLastCalledWith(false)
    expect(renderer.hideStep).not.toHaveBeenCalled()
  })

  it('emits step:waiting once even if the adapter calls onWaiting twice', async () => {
    const adapter = stubAdapter((req) => {
      req.onWaiting('route')
      req.onWaiting('target')
      return Promise.resolve({ target: null })
    })
    engine = new TourEngine({ renderer, navigation: adapter })

    const waiting: string[] = []
    engine.on('step:waiting', (e) => waiting.push(e.reason))

    await engine.start(routedFlow)
    expect(waiting).toEqual(['route'])
  })

  it('exposes isWaiting without touching isActive or isPaused', async () => {
    let seen: { waiting: boolean; active: boolean; paused: boolean } | null = null
    const adapter = stubAdapter((req) => {
      req.onWaiting('target')
      seen = { waiting: engine.isWaiting, active: engine.isActive, paused: engine.isPaused }
      return Promise.resolve({ target: null })
    })
    engine = new TourEngine({ renderer, navigation: adapter })
    await engine.start(routedFlow)

    // A wait is not a pause. Reusing _paused would make pause() a silent no-op
    // during a wait, would let resume() start a second waiter, and would kill
    // Escape exactly when the user most wants out.
    expect(seen).toEqual({ waiting: true, active: true, paused: false })
    expect(engine.isWaiting).toBe(false)
  })

  it('renders unanchored on timeout — it does not skip and does not end', async () => {
    const adapter = stubAdapter(() =>
      Promise.resolve({ target: null, timedOut: 'target' as const }),
    )
    engine = new TourEngine({ renderer, navigation: adapter })

    const timeouts: string[] = []
    const entered: string[] = []
    engine.on('step:timeout', (e) => timeouts.push(`${e.stepId}:${e.reason}`))
    engine.on('step:enter', (e) => entered.push(e.stepId))

    await engine.start(routedFlow)

    expect(timeouts).toEqual(['d1:target'])
    expect(entered).toEqual(['d1'])
    expect(engine.isActive).toBe(true)
    // Policy composes in userland — the engine has none.
    expect(renderer.renderStep).toHaveBeenCalled()
  })

  it('emits step:target-missing rather than silently rendering a modal', async () => {
    engine = new TourEngine({ renderer })
    const missing: Array<{ stepId: string; selector: string | null }> = []
    engine.on('step:target-missing', (e) => missing.push(e))

    await engine.start({
      id: 'missing',
      initial: 'main',
      states: {
        main: { steps: [{ id: 'm1', target: '#nowhere', content: { title: 'X' } }], final: true },
      },
    })

    expect(missing).toEqual([{ stepId: 'm1', selector: '#nowhere' }])
  })

  it('says nothing for a deliberate target-less step', async () => {
    engine = new TourEngine({ renderer })
    const missing: unknown[] = []
    engine.on('step:target-missing', (e) => missing.push(e))

    await engine.start({
      id: 'modal',
      initial: 'main',
      states: { main: { steps: [{ id: 'm1', content: { title: 'X' } }], final: true } },
    })

    expect(missing).toEqual([])
  })

  it('aborts the adapter when the tour ends mid-wait', async () => {
    let captured: AbortSignal | null = null
    const adapter = stubAdapter(
      (req) =>
        new Promise<ResolveTargetResult>((resolve) => {
          captured = req.signal
          req.signal.addEventListener('abort', () => resolve({ target: null }))
        }),
    )
    engine = new TourEngine({ renderer, navigation: adapter })

    const started = engine.start(routedFlow)
    await Promise.resolve()
    // end() on the engine; stop() is the createGuideFlow wrapper's name for it.
    engine.end()
    await started

    expect((captured as AbortSignal | null)?.aborted).toBe(true)
  })

  it('aborts the adapter when the tour is paused mid-wait', async () => {
    let captured: AbortSignal | null = null
    const adapter = stubAdapter(
      (req) =>
        new Promise<ResolveTargetResult>((resolve) => {
          captured = req.signal
          req.signal.addEventListener('abort', () => resolve({ target: null }))
        }),
    )
    engine = new TourEngine({ renderer, navigation: adapter })

    const started = engine.start(routedFlow)
    await Promise.resolve()
    engine.pause()
    await started

    expect((captured as AbortSignal | null)?.aborted).toBe(true)
  })

  it('survives an adapter that throws', async () => {
    // A third-party adapter must not be able to kill tours.
    const adapter = stubAdapter(() => Promise.reject(new Error('adapter exploded')))
    engine = new TourEngine({ renderer, navigation: adapter })

    const errors: unknown[] = []
    engine.on('tour:error', (e) => errors.push(e))

    await engine.start(routedFlow)

    expect(errors).toEqual([])
    expect(engine.isActive).toBe(true)
    expect(renderer.renderStep).toHaveBeenCalled()
  })

  it('attaches on start and detaches when the tour ends', async () => {
    const el = document.createElement('div')
    el.id = 'on-dashboard'
    document.body.appendChild(el)

    const adapter = stubAdapter(() => Promise.resolve({ target: el }))
    engine = new TourEngine({ renderer, navigation: adapter })

    await engine.start(routedFlow)
    expect(adapter.attachCalls.count).toBe(1)

    engine.end()
    el.remove()

    // The teardown ran, so a route change after the tour ended reaches nobody.
    const before = adapter.requests.length
    adapter.fire()
    await Promise.resolve()
    expect(adapter.requests).toHaveLength(before)
  })

  it('destroys the adapter even when no tour was ever started', async () => {
    // _doEnd() early-returns on !this._active, so putting this there would skip
    // teardown on an idle engine and leak the history patch.
    const adapter = stubAdapter()
    const idle = new TourEngine({ renderer, navigation: adapter })

    idle.destroy()

    expect(adapter.destroyCalls.count).toBe(1)
    await Promise.resolve()
  })

  it('re-anchors on a route change only when the target has gone', async () => {
    const el = document.createElement('div')
    el.id = 'on-dashboard'
    document.body.appendChild(el)

    const adapter = stubAdapter(() => Promise.resolve({ target: el }))
    engine = new TourEngine({ renderer, navigation: adapter })
    await engine.start(routedFlow)

    const before = adapter.requests.length
    adapter.fire()
    await Promise.resolve()
    // Still mounted: a rerender would re-emit step:enter and double-count.
    expect(adapter.requests).toHaveLength(before)

    el.remove()
    adapter.fire()
    await Promise.resolve()
    await Promise.resolve()
    expect(adapter.requests.length).toBeGreaterThan(before)
  })

  it('resolves a function target and awaits it', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    engine = new TourEngine({ renderer })
    const entered: Array<Element | null> = []
    engine.on('step:enter', (e) => entered.push(e.target))

    await engine.start({
      id: 'fn',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 'f1', target: () => Promise.resolve(el), content: { title: 'Fn' } },
          ],
          final: true,
        },
      },
    })

    expect(entered).toEqual([el])
  })

  it('surfaces a throwing function target as tour:error', async () => {
    // Proves the resolution sits inside the render try/catch.
    engine = new TourEngine({ renderer })
    const errors: unknown[] = []
    engine.on('tour:error', (e) => errors.push(e))

    await engine.start({
      id: 'fn-throws',
      initial: 'main',
      states: {
        main: {
          steps: [
            {
              id: 'f1',
              target: () => {
                throw new Error('boom')
              },
              content: { title: 'Fn' },
            },
          ],
          final: true,
        },
      },
    })

    expect(errors).toHaveLength(1)
  })

  it('paints once when a slow wait is superseded by a newer navigation', async () => {
    const release: { fn: (() => void) | null } = { fn: null }
    let call = 0
    const adapter = stubAdapter((req) => {
      call++
      if (call === 1) {
        return new Promise<ResolveTargetResult>((resolve) => {
          release.fn = () => resolve({ target: null })
          req.signal.addEventListener('abort', () => resolve({ target: null }))
        })
      }
      return Promise.resolve({ target: null })
    })
    engine = new TourEngine({ renderer, navigation: adapter })

    const entered: string[] = []
    engine.on('step:enter', (e) => entered.push(e.stepId))

    const first = engine.start({
      id: 'race',
      initial: 'main',
      states: {
        main: {
          steps: [
            { id: 'r1', content: { title: 'One' } },
            { id: 'r2', content: { title: 'Two' } },
          ],
          final: true,
        },
      },
    })
    await Promise.resolve()
    const second = engine.next()
    release.fn?.()
    await Promise.all([first, second])

    // The superseded render must not paint. Without the generation check after
    // the adapter await, both would.
    expect(entered).toEqual(['r2'])
  })
})
