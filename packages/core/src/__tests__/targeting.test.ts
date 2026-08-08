// ---------------------------------------------------------------------------
// Targeting, scheduling and frequency capping.
//
// Closes `no-targeting-or-audience-rules` and
// `no-frequency-capping-or-flow-orchestration`. There was no `audience`,
// `urlPattern`, `trigger` or `priority` field anywhere on FlowDefinition and no
// rule evaluator; ProgressStore was strictly per-flow, with no global "last
// shown at", no session counter, no cooldown, and no queue when two flows both
// wanted to start. Deciding *who* sees a tour, *where* and *how often* was
// entirely the host application's problem, hand-written at every call site.
//
// The rules are pure functions and that is where the value is — most of this
// file tests them directly.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import { recordShow } from '../targeting/caps.js'
import { createTargeting } from '../targeting/index.js'
import {
  emptyCaps,
  evaluateFlow,
  matchAudience,
  matchSchedule,
  matchUrl,
  sessionCount,
  type CapRecord,
} from '../targeting/rules.js'
import type { FlowDefinition, GuidanceContext } from '../types/index.js'

const HOUR = 3600_000
const DAY = 24 * HOUR

function flow(id: string, targeting?: FlowDefinition['targeting']): FlowDefinition {
  return {
    id,
    initial: 'main',
    states: { main: { steps: [{ id: `${id}-s1`, content: { title: id } }], final: true } },
    ...(targeting !== undefined && { targeting }),
  }
}

function env(overrides: Partial<Parameters<typeof evaluateFlow>[1]> = {}): Parameters<typeof evaluateFlow>[1] {
  return {
    context: {} as GuidanceContext,
    url: 'https://app.test/dashboard',
    now: Date.parse('2026-07-31T12:00:00Z'),
    caps: emptyCaps(),
    sessionGapMs: 30 * 60_000,
    completed: false,
    dismissed: false,
    trigger: 'load',
    ...overrides,
  }
}

// ── matchUrl ────────────────────────────────────────────────────────────────

describe('matchUrl', () => {
  const href = (path: string): string => `https://app.test${path}`

  it('anchors, so /user does not match /users/42', () => {
    expect(matchUrl('/user', href('/users/42'))).toBe(false)
    expect(matchUrl('/user', href('/user'))).toBe(true)
  })

  it('matches one segment with * and any number with **', () => {
    expect(matchUrl('/app/*', href('/app/billing'))).toBe(true)
    expect(matchUrl('/app/*', href('/app/billing/invoices'))).toBe(false)
    expect(matchUrl('/app/**', href('/app/billing/invoices'))).toBe(true)
  })

  it('treats metacharacters literally', () => {
    expect(matchUrl('/v1.0/docs', href('/v1.0/docs'))).toBe(true)
    expect(matchUrl('/v1.0/docs', href('/v1X0/docs'))).toBe(false)
  })

  it('matches the full href when the pattern does not start with a slash', () => {
    expect(matchUrl('https://app.test/**', href('/anything'))).toBe(true)
    expect(matchUrl('https://other.test/**', href('/anything'))).toBe(false)
  })

  it('accepts a RegExp against the full href', () => {
    expect(matchUrl(/app\.test\/dash/, href('/dashboard'))).toBe(true)
  })

  it('rejects rather than throwing on an empty url (SSR)', () => {
    expect(matchUrl('/anything', '')).toBe(false)
  })
})

// ── matchAudience ───────────────────────────────────────────────────────────

describe('matchAudience', () => {
  it('treats roles as any-of', () => {
    const ctx = { roles: ['editor'] } as unknown as GuidanceContext
    expect(matchAudience({ roles: ['admin', 'editor'] }, ctx)).toBe(true)
    expect(matchAudience({ roles: ['admin'] }, ctx)).toBe(false)
  })

  it('treats flags as ALL-of', () => {
    // A feature gate that only needs one of several flags is not a gate.
    const ctx = { featureFlags: { a: true, b: false } } as unknown as GuidanceContext
    expect(matchAudience({ flags: ['a'] }, ctx)).toBe(true)
    expect(matchAudience({ flags: ['a', 'b'] }, ctx)).toBe(false)
  })

  it('matches a where primitive with ===', () => {
    const ctx = { plan: 'pro', seats: 5 } as unknown as GuidanceContext
    expect(matchAudience({ where: { plan: 'pro' } }, ctx)).toBe(true)
    expect(matchAudience({ where: { plan: 'free' } }, ctx)).toBe(false)
    // No coercion: '5' is not 5.
    expect(matchAudience({ where: { seats: '5' } }, ctx)).toBe(false)
    expect(matchAudience({ where: { seats: 5 } }, ctx)).toBe(true)
  })

  it('treats a where array as any-of', () => {
    const ctx = { plan: 'team' } as unknown as GuidanceContext
    expect(matchAudience({ where: { plan: ['pro', 'team'] } }, ctx)).toBe(true)
    expect(matchAudience({ where: { plan: ['pro', 'enterprise'] } }, ctx)).toBe(false)
  })

  it('accepts a predicate', () => {
    const ctx = { seats: 12 } as unknown as GuidanceContext
    expect(matchAudience((c) => ((c as { seats?: number }).seats ?? 0) > 10, ctx)).toBe(true)
  })

  it('treats a throwing predicate as "not eligible" rather than crashing', () => {
    // Deliberately unlike Step.showIf, whose predicate throws outside the
    // engine's error boundary. Targeting evaluates every registered flow, so
    // one bad predicate would take down the evaluation of all of them.
    const boom = (): boolean => {
      throw new Error('bad rule')
    }
    expect(() => matchAudience(boom, {} as GuidanceContext)).not.toThrow()
    expect(matchAudience(boom, {} as GuidanceContext)).toBe(false)
  })
})

// ── matchSchedule ───────────────────────────────────────────────────────────

describe('matchSchedule', () => {
  const now = Date.parse('2026-07-31T12:00:00Z')

  it('blocks before startsAt and after endsAt', () => {
    expect(matchSchedule({ startsAt: now + DAY }, now)).toBe(false)
    expect(matchSchedule({ endsAt: now - DAY }, now)).toBe(false)
    expect(matchSchedule({ startsAt: now - DAY, endsAt: now + DAY }, now)).toBe(true)
  })

  it('accepts an ISO string and epoch ms identically', () => {
    expect(matchSchedule({ startsAt: '2026-07-30T00:00:00Z' }, now)).toBe(true)
    expect(matchSchedule({ startsAt: Date.parse('2026-07-30T00:00:00Z') }, now)).toBe(true)
  })

  it('ignores an unparseable bound rather than blocking forever', () => {
    // A typo in a date should not silently disable a tour with no diagnostic.
    expect(matchSchedule({ startsAt: 'next tuesday' }, now)).toBe(true)
  })
})

// ── sessionCount ────────────────────────────────────────────────────────────

describe('sessionCount', () => {
  const now = Date.parse('2026-07-31T12:00:00Z')
  const gap = 30 * 60_000

  it('counts shows within the idle gap, walking newest-first', () => {
    const recent = [now - 10 * 60_000, now - 5 * 60_000, now - 60_000]
    expect(sessionCount(recent, now, gap)).toBe(3)
  })

  it('stops at the first gap larger than the window', () => {
    const recent = [now - 90 * 60_000, now - 10 * 60_000, now - 5 * 60_000, now - 60_000]
    expect(sessionCount(recent, now, gap)).toBe(3)
  })

  it('returns 0 when the only show is long past', () => {
    expect(sessionCount([now - 2 * HOUR], now, gap)).toBe(0)
  })

  it('returns 0 for an empty history', () => {
    expect(sessionCount([], now, gap)).toBe(0)
  })
})

// ── evaluateFlow ────────────────────────────────────────────────────────────

describe('evaluateFlow', () => {
  it('reports a flow with no targeting as manual, never auto-started', () => {
    const r = evaluateFlow(flow('plain'), env({ trigger: 'load' }))
    expect(r.eligible).toBe(false)
    expect(r.blockedBy).toEqual(['trigger'])
  })

  it('passes a matching flow', () => {
    const r = evaluateFlow(
      flow('f', { startTrigger: 'load', urlPattern: '/dashboard' }),
      env(),
    )
    expect(r.eligible).toBe(true)
    expect(r.blockedBy).toEqual([])
  })

  it('short-circuits on url and never calls the audience predicate', () => {
    // This is what keeps evaluate() cheap enough to run on every DOM mutation.
    const audience = vi.fn(() => true)
    const r = evaluateFlow(
      flow('f', { startTrigger: 'load', urlPattern: '/nope', audience }),
      env(),
    )
    expect(r.blockedBy).toEqual(['url'])
    expect(audience).not.toHaveBeenCalled()
  })

  it('reports completed and dismissed', () => {
    const f = flow('f', { startTrigger: 'load' })
    expect(evaluateFlow(f, env({ completed: true })).blockedBy).toEqual(['completed'])
    expect(evaluateFlow(f, env({ dismissed: true })).blockedBy).toEqual(['dismissed'])
  })

  it('enforces cooldownMs at the boundary', () => {
    const now = env().now
    const caps: CapRecord = {
      v: 1,
      recent: [now - 6 * DAY],
      total: 1,
      flows: { f: { last: now - 6 * DAY, total: 1, recent: [now - 6 * DAY] } },
    }
    const f = flow('f', { startTrigger: 'load', frequency: { cooldownMs: 7 * DAY } })
    expect(evaluateFlow(f, env({ caps })).blockedBy).toContain('cooldown')

    const older: CapRecord = {
      ...caps,
      flows: { f: { last: now - 8 * DAY, total: 1, recent: [now - 8 * DAY] } },
    }
    expect(evaluateFlow(f, env({ caps: older })).eligible).toBe(true)
  })

  it('enforces maxTotal', () => {
    const now = env().now
    const caps: CapRecord = {
      v: 1, recent: [], total: 3,
      flows: { f: { last: now - 10 * DAY, total: 3, recent: [] } },
    }
    const f = flow('f', { startTrigger: 'load', frequency: { maxTotal: 3 } })
    expect(evaluateFlow(f, env({ caps })).blockedBy).toContain('total')

    caps.flows['f']!.total = 2
    expect(evaluateFlow(f, env({ caps })).eligible).toBe(true)
  })

  it('enforces maxPerSession, and lets it through after the idle gap', () => {
    const now = env().now
    const inSession: CapRecord = {
      v: 1, recent: [now - 60_000], total: 1,
      flows: { f: { last: now - 60_000, total: 1, recent: [now - 60_000] } },
    }
    const f = flow('f', { startTrigger: 'load', frequency: { maxPerSession: 1 } })
    expect(evaluateFlow(f, env({ caps: inSession })).blockedBy).toContain('session')

    const lastSession: CapRecord = {
      v: 1, recent: [now - 2 * HOUR], total: 1,
      flows: { f: { last: now - 2 * HOUR, total: 1, recent: [now - 2 * HOUR] } },
    }
    expect(evaluateFlow(f, env({ caps: lastSession })).eligible).toBe(true)
  })

  it('enforces a global session cap across different flows', () => {
    // The knob that stops a user being shown four tours in a row.
    const now = env().now
    const caps: CapRecord = {
      v: 1, recent: [now - 60_000], total: 1,
      flows: { a: { last: now - 60_000, total: 1, recent: [now - 60_000] } },
    }
    const b = flow('b', { startTrigger: 'load' })
    const r = evaluateFlow(b, env({ caps, globals: { maxPerSession: 1 } }))
    expect(r.blockedBy).toContain('global-session')
  })

  it('carries priority through', () => {
    expect(evaluateFlow(flow('f', { startTrigger: 'load', priority: 7 }), env()).priority).toBe(7)
  })
})

// ── caps ────────────────────────────────────────────────────────────────────

describe('recordShow', () => {
  const now = Date.parse('2026-07-31T12:00:00Z')

  it('increments both global and per-flow counters', () => {
    const out = recordShow(emptyCaps(), 'f', now)
    expect(out.total).toBe(1)
    expect(out.recent).toEqual([now])
    expect(out.flows['f']).toEqual({ last: now, total: 1, recent: [now] })
  })

  it('bounds the global history', () => {
    // localStorage has a hard quota; a record that grows without bound
    // eventually throws on write and silently stops enforcing every cap.
    let caps = emptyCaps()
    for (let i = 0; i < 100; i++) caps = recordShow(caps, 'f', now + i)
    expect(caps.recent.length).toBeLessThanOrEqual(32)
    expect(caps.flows['f']!.recent.length).toBeLessThanOrEqual(16)
    // The total is still exact.
    expect(caps.total).toBe(100)
  })

  it('prunes to the 50 most recently shown flows', () => {
    let caps = emptyCaps()
    for (let i = 0; i < 80; i++) caps = recordShow(caps, `flow-${i}`, now + i)
    expect(Object.keys(caps.flows)).toHaveLength(50)
    // Newest kept, oldest dropped.
    expect(caps.flows['flow-79']).toBeDefined()
    expect(caps.flows['flow-0']).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const before = emptyCaps()
    recordShow(before, 'f', now)
    expect(before.total).toBe(0)
  })
})

// ── The engine wiring ───────────────────────────────────────────────────────

describe('createTargeting', () => {
  let gf: GuideFlowInstance
  let targeting: ReturnType<typeof createTargeting> | null = null

  beforeEach(() => {
    localStorage.clear()
    gf = createGuideFlow({ injectStyles: false, context: { userId: 'u1' } })
  })

  afterEach(() => {
    targeting?.destroy()
    targeting = null
    gf.destroy()
    document.body.innerHTML = ''
  })

  it('auto-starts the highest-priority eligible flow', async () => {
    gf.createFlow(flow('low', { startTrigger: 'load', priority: 1 }))
    gf.createFlow(flow('high', { startTrigger: 'load', priority: 10 }))
    targeting = createTargeting(gf)

    const started = await targeting.autoStart()

    expect(started?.id).toBe('high')
    expect(gf.flowId).toBe('high')
  })

  it('never auto-starts a manual flow', async () => {
    // The default. A flow with no targeting block must stay opt-in.
    gf.createFlow(flow('manual'))
    targeting = createTargeting(gf)

    expect(await targeting.autoStart()).toBeNull()
    expect(gf.isActive).toBe(false)
  })

  it('refuses to interrupt a running tour', async () => {
    // TourEngine.start() ends a running tour first, which emits tour:abandon —
    // analytics would log that as the user giving up.
    gf.createFlow(flow('candidate', { startTrigger: 'load', priority: 10 }))
    targeting = createTargeting(gf)
    await gf.start(flow('already-running'))

    expect(await targeting.autoStart()).toBeNull()
    expect(gf.flowId).toBe('already-running')
  })

  it('starts exactly one tour for two autoStart calls in the same tick', async () => {
    gf.createFlow(flow('f', { startTrigger: 'load' }))
    targeting = createTargeting(gf)

    const starts: string[] = []
    gf.on('tour:start', (e) => starts.push(e.flowId))

    await Promise.all([targeting.autoStart(), targeting.autoStart()])

    expect(starts).toEqual(['f'])
  })

  it('explains why a flow was blocked', async () => {
    // "Why didn't my tour show?" becomes an API call rather than a support
    // ticket. No competitor exposes this.
    gf.createFlow(flow('f', { startTrigger: 'load', urlPattern: '/nowhere' }))
    targeting = createTargeting(gf)

    const results = await targeting.evaluate()

    expect(results).toHaveLength(1)
    expect(results[0]?.eligible).toBe(false)
    expect(results[0]?.blockedBy).toEqual(['url'])
  })

  it('records a show off tour:start, including a manual start', async () => {
    // start() can return without starting, and a manual gf.start() elsewhere in
    // the app must still count against a global session cap.
    gf.createFlow(flow('manual'))
    targeting = createTargeting(gf)

    await gf.start(flow('manual'))
    await new Promise((r) => setTimeout(r, 10))

    const caps = await gf.progress.getRecord<CapRecord>('u1', 'caps')
    expect(caps?.total).toBe(1)
    expect(caps?.flows['manual']?.total).toBe(1)
  })

  it('enforces a cap it recorded itself', async () => {
    gf.createFlow(flow('once', { startTrigger: 'load', frequency: { maxTotal: 1 } }))
    targeting = createTargeting(gf)

    expect((await targeting.autoStart())?.id).toBe('once')
    await new Promise((r) => setTimeout(r, 10))
    gf.stop()

    expect(await targeting.autoStart()).toBeNull()
    const results = await targeting.evaluate()
    expect(results[0]?.blockedBy).toContain('total')
  })

  it('resetCaps clears the record', async () => {
    gf.createFlow(flow('once', { startTrigger: 'load', frequency: { maxTotal: 1 } }))
    targeting = createTargeting(gf)
    await targeting.autoStart()
    await new Promise((r) => setTimeout(r, 10))
    gf.stop()

    await targeting.resetCaps()

    expect((await targeting.autoStart())?.id).toBe('once')
  })

  it('send() starts only an event-triggered flow whose name matches', async () => {
    gf.createFlow(flow('on-signup', { startTrigger: 'event', event: 'signup' }))
    gf.createFlow(flow('on-upgrade', { startTrigger: 'event', event: 'upgrade' }))
    targeting = createTargeting(gf)

    // Event flows are not candidates for autoStart.
    expect(await targeting.autoStart()).toBeNull()

    expect((await targeting.send('signup'))?.id).toBe('on-signup')
  })

  it('never reads the cap store with no userId, but keeps url rules live', async () => {
    // Caps need an identity. Without one the frequency guards are skipped
    // entirely — not defaulted to some anonymous bucket — while everything free
    // (url, audience, schedule) keeps working.
    const anon = createGuideFlow({ injectStyles: false })
    const getRecord = vi.spyOn(anon.progress, 'getRecord')
    anon.createFlow(flow('f', { startTrigger: 'load', frequency: { maxTotal: 1 } }))
    anon.createFlow(flow('g', { startTrigger: 'load', urlPattern: '/nowhere' }))
    const t = createTargeting(anon)

    const results = await t.evaluate()

    expect(getRecord).not.toHaveBeenCalled()
    expect(results.find((r) => r.flow.id === 'f')?.eligible).toBe(true)
    expect(results.find((r) => r.flow.id === 'g')?.blockedBy).toEqual(['url'])

    getRecord.mockRestore()
    t.destroy()
    anon.destroy()
  })

  it('blocks a maxTotal: 0 flow outright', () => {
    // Not a special case — 0 >= 0. Worth pinning because "never show this"
    // is a legitimate way to disable a flow without deleting it.
    const r = evaluateFlow(
      flow('never', { startTrigger: 'load', frequency: { maxTotal: 0 } }),
      env(),
    )
    expect(r.blockedBy).toContain('total')
  })

  it('destroy() stops it starting anything', async () => {
    gf.createFlow(flow('f', { startTrigger: 'load' }))
    targeting = createTargeting(gf)
    targeting.destroy()

    expect(await targeting.autoStart()).toBeNull()
    expect(gf.isActive).toBe(false)
  })

  it('install() starts a selector flow once its element appears', async () => {
    gf.createFlow(flow('sel', { startTrigger: 'selector', selector: '#appears-later' }))
    targeting = createTargeting(gf)
    targeting.install()

    expect(gf.isActive).toBe(false)

    const el = document.createElement('div')
    el.id = 'appears-later'
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 30))

    expect(gf.flowId).toBe('sel')
  })

  // ── install() and flows that arrive late (7.10d) ────────────────────────
  //
  // Every case below was MEASURED failing before the fix. They matter because
  // `apps/docs/guide/hosting-flows.md` documents fetching a `.flow.json` and
  // calling `createFlow` when it resolves — which is, by construction, after
  // `install()`. The old code filtered `listFlows()` exactly once.

  async function appear(id: string): Promise<void> {
    const el = document.createElement('div')
    el.id = id
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 40))
  }

  it('arms a selector flow registered AFTER install(), with none present at install', async () => {
    targeting = createTargeting(gf)
    targeting.install()

    gf.createFlow(flow('late', { startTrigger: 'selector', selector: '#late-el' }))
    await appear('late-el')

    expect(gf.flowId).toBe('late')
  })

  it('arms a selector flow registered after install() when another was already there', async () => {
    // The observer already exists in this case, so this fails for the *other*
    // reason: the candidate array was captured at install time.
    gf.createFlow(flow('early', { startTrigger: 'selector', selector: '#never-appears' }))
    targeting = createTargeting(gf)
    targeting.install()

    gf.createFlow(flow('late', { startTrigger: 'selector', selector: '#late-el' }))
    await appear('late-el')

    expect(gf.flowId).toBe('late')
  })

  it('does not re-start a selector tour the user closed', async () => {
    // The observer never disconnected and `check()` had no memory, so the first
    // DOM mutation after the tour ended started it again — and the next one,
    // and the next. A frequency cap would have masked it; caps are optional.
    gf.createFlow(flow('sel', { startTrigger: 'selector', selector: '#now-here' }))
    targeting = createTargeting(gf)
    targeting.install()

    await appear('now-here')
    expect(gf.flowId).toBe('sel')

    gf.stop()
    await new Promise((r) => setTimeout(r, 10))
    expect(gf.isActive).toBe(false)

    document.body.appendChild(document.createElement('span'))
    await new Promise((r) => setTimeout(r, 40))

    expect(gf.flowId).toBe(null)
  })

  it('a selector flow that could not start stays retryable', async () => {
    // The converse of the test above. Marking on *match* rather than on a
    // successful start would burn the flow when the element happens to appear
    // while another tour is on screen.
    gf.createFlow(flow('blocker'))
    gf.createFlow(flow('sel', { startTrigger: 'selector', selector: '#contested' }))
    targeting = createTargeting(gf)
    targeting.install()

    await gf.start('blocker')
    await appear('contested')
    expect(gf.flowId).toBe('blocker')

    gf.stop()
    await new Promise((r) => setTimeout(r, 10))
    document.body.appendChild(document.createElement('span'))
    await new Promise((r) => setTimeout(r, 40))

    expect(gf.flowId).toBe('sel')
  })

  // ── Route changes that are not the back button (7.10d) ──────────────────
  //
  // `install()` listened to `popstate` and nothing else, so the only navigation
  // that re-evaluated `load` flows was the back button. `targeting.md` said
  // "on every route change".
  //
  // happy-dom is the constraint on how far these can go: `history.pushState`
  // there does NOT move `window.location.href`, so `watchHistory`'s
  // href-coalescing correctly swallows it and a pushState assertion would be
  // testing the mock. Setting `location.hash` *does* move it and dispatches
  // `hashchange` — a genuine SPA route change (hash routers), and one the old
  // popstate-only listener did not hear either. The pushState path is real only
  // in a real browser; `apps/e2e` is where that lives.

  it('re-evaluates load flows on a hash route change, which popstate never saw', async () => {
    const start = window.location.href
    targeting = createTargeting(gf)
    targeting.install()
    await new Promise((r) => setTimeout(r, 10))

    gf.createFlow(flow('late-load', { startTrigger: 'load' }))
    window.location.hash = '#pushed-route'
    await new Promise((r) => setTimeout(r, 40))

    expect(gf.flowId).toBe('late-load')
    window.location.href = start
  })

  it('patches history cooperatively on install and restores it on destroy', () => {
    // The half of `watchHistory` happy-dom can still prove: that targeting is
    // wired into pushState at all, and that it lets go again. Without the
    // restore, every test file that installed targeting would leave a wrapper
    // on `history.pushState` for the rest of the run.
    /* eslint-disable @typescript-eslint/unbound-method -- identity comparison
       is the assertion; nothing is invoked detached. */
    const pristine = history.pushState
    targeting = createTargeting(gf)
    targeting.install()
    expect(history.pushState).not.toBe(pristine)

    targeting.destroy()
    targeting = null
    expect(history.pushState).toBe(pristine)
    /* eslint-enable @typescript-eslint/unbound-method */
  })
})
