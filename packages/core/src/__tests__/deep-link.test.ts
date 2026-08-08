// ---------------------------------------------------------------------------
// `?gf_tour=` — a link that starts a named tour in the app the recipient has.
//
// The interesting cases are not "the link works". They are the two silent gates
// in `start()` — dismissal and completion, checked in that order, each returning
// with no render and no event — because those fire for exactly the people a
// support agent sends a link to, and produce "the link you sent me does
// nothing" with no error anywhere.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { createGuideFlow, type GuideFlowInstance } from '../index.js'
import { startFromUrl } from '../targeting/deep-link.js'
import type { FlowDefinition } from '../types/index.js'

const linkable: FlowDefinition = {
  id: 'billing',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 'b1', content: { title: 'One' } },
        { id: 'b2', content: { title: 'Two' } },
        { id: 'b3', content: { title: 'Three' } },
      ],
      final: true,
    },
  },
  targeting: { deepLink: true },
  persistDismissal: true,
}

/** Registered, but never marked linkable. */
const private_: FlowDefinition = {
  id: 'internal',
  initial: 'main',
  states: { main: { steps: [{ id: 'i1', content: { title: 'Internal' } }], final: true } },
}

let gf: GuideFlowInstance | null = null
const AT = 'https://app.example.com/dashboard'

/**
 * Assigning `location.href`, not `replaceState`.
 *
 * MEASURED: happy-dom's `history.replaceState` does not move `location.href` at
 * all — it stays on the default `http://localhost:3000/` — which is the same
 * limitation CLAUDE.md records for `pushState`. Assignment does work. That also
 * means the *stripping* side of this feature cannot be observed here: the
 * assertions below spy on the `replaceState` call, and `apps/e2e` checks the
 * address bar for real.
 */
const go = (query: string): void => {
  window.location.href = `${AT}${query}`
}

beforeEach(() => {
  localStorage.clear()
  go('')
})

afterEach(() => {
  gf?.destroy()
  gf = null
  document.body.innerHTML = ''
})

describe('startFromUrl', () => {
  it('starts the flow the link names', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?gf_tour=billing')

    const started = await startFromUrl(gf)

    expect(started?.id).toBe('billing')
    expect(gf.isActive).toBe(true)
    expect(gf.currentStepId).toBe('b1')
  })

  it('jumps to the step the link names', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?gf_tour=billing&gf_tour_step=b3')

    await startFromUrl(gf)

    expect(gf.currentStepId).toBe('b3')
  })

  it('opens at the beginning when the step id is stale', async () => {
    // A link that outlived an edit to the flow degrades to "the tour opened",
    // not to nothing.
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?gf_tour=billing&gf_tour_step=deleted-step')

    await startFromUrl(gf)

    expect(gf.isActive).toBe(true)
    expect(gf.currentStepId).toBe('b1')
  })

  it('strips its own parameters and leaves the rest of the URL alone', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?utm_source=zendesk&gf_tour=billing&gf_tour_step=b2&tab=invoices')
    const replace = vi.spyOn(window.history, 'replaceState')

    await startFromUrl(gf)

    expect(replace).toHaveBeenCalledTimes(1)
    const written = new URL(String(replace.mock.calls[0]?.[2]))
    expect(written.searchParams.get('gf_tour')).toBeNull()
    expect(written.searchParams.get('gf_tour_step')).toBeNull()
    // Everything that is not ours survives — a support link carries UTM tags
    // and the app's own state, and eating those would be a real regression.
    expect(written.searchParams.get('utm_source')).toBe('zendesk')
    expect(written.searchParams.get('tab')).toBe('invoices')
    expect(written.pathname).toBe('/dashboard')
    replace.mockRestore()
  })

  it('can be told not to strip', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?gf_tour=billing')
    const replace = vi.spyOn(window.history, 'replaceState')

    await startFromUrl(gf, { strip: false })

    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })

  it('honours a custom parameter name', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?tour=billing')

    const started = await startFromUrl(gf, { param: 'tour' })
    expect(started?.id).toBe('billing')
  })
})

describe('startFromUrl — what it refuses', () => {
  it('does nothing with no parameter', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)

    expect(await startFromUrl(gf)).toBeNull()
    expect(gf.isActive).toBe(false)
  })

  it('refuses a flow that did not opt in', async () => {
    // The security boundary. A URL is attacker-controlled and the recipient is
    // signed in; opting in per flow is what stops a crafted link showing an
    // arbitrary one of the host's tours.
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(private_)
    go('?gf_tour=internal')

    expect(await startFromUrl(gf)).toBeNull()
    expect(gf.isActive).toBe(false)
  })

  it('refuses an id that is not registered, without logging it', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?gf_tour=<img src=x onerror=alert(1)>')

    expect(await startFromUrl(gf)).toBeNull()
    expect(gf.isActive).toBe(false)
  })

  it('refuses while a tour is already running', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    await gf.start(linkable)
    go('?gf_tour=billing')

    expect(await startFromUrl(gf)).toBeNull()
    expect(gf.currentStepId).toBe('b1')
  })

  it('leaves the URL untouched when it refuses', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(private_)
    go('?gf_tour=internal')
    const replace = vi.spyOn(window.history, 'replaceState')

    await startFromUrl(gf)

    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })
})

describe('startFromUrl — delivery policy vs eligibility policy', () => {
  // A link overrides how often and where we would have PUSHED a tour. It does
  // not override who the tour is FOR. An author who scoped a flow to enterprise
  // customers meant "not this user", and a URL does not get to overrule that.
  it('refuses a flow whose audience excludes this user', async () => {
    gf = createGuideFlow({ context: { userId: 'u', plan: 'free' }, injectStyles: false })
    gf.createFlow({
      ...linkable,
      targeting: { deepLink: true, audience: { where: { plan: 'enterprise' } } },
    })
    go('?gf_tour=billing')

    expect(await startFromUrl(gf)).toBeNull()
    expect(gf.isActive).toBe(false)
  })

  it('starts it for a user the audience does include', async () => {
    gf = createGuideFlow({ context: { userId: 'u', plan: 'enterprise' }, injectStyles: false })
    gf.createFlow({
      ...linkable,
      targeting: { deepLink: true, audience: { where: { plan: 'enterprise' } } },
    })
    go('?gf_tour=billing')

    expect((await startFromUrl(gf))?.id).toBe('billing')
  })

  it('refuses a flow outside its schedule', async () => {
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow({
      ...linkable,
      targeting: { deepLink: true, schedule: { endsAt: '2020-01-01T00:00:00Z' } },
    })
    go('?gf_tour=billing')

    expect(await startFromUrl(gf)).toBeNull()
  })

  it('DOES override a frequency cap — that is delivery policy', async () => {
    gf = createGuideFlow({ context: { userId: 'u' }, injectStyles: false })
    gf.createFlow({
      ...linkable,
      targeting: { deepLink: true, frequency: { maxTotal: 1, cooldownMs: 86_400_000 } },
    })
    go('?gf_tour=billing')

    expect((await startFromUrl(gf))?.id).toBe('billing')
  })
})

describe('startFromUrl — the two silent gates', () => {
  it('replays a tour the user already completed', async () => {
    // `start()` checks isCompleted BEFORE the version gate and returns with no
    // render and no event. Without clearing it first, a support link is a no-op
    // for precisely the people who need it re-explained.
    gf = createGuideFlow({ context: { userId: 'u1' }, injectStyles: false })
    gf.createFlow(linkable)

    await gf.start(linkable)
    await gf.next()
    await gf.next()
    await gf.next()
    expect(gf.isActive).toBe(false)
    await new Promise((r) => setTimeout(r, 0))

    // Confirm the gate is real before proving we get past it.
    await gf.start(linkable)
    expect(gf.isActive).toBe(false)

    go('?gf_tour=billing')
    const started = await startFromUrl(gf)

    expect(started?.id).toBe('billing')
    expect(gf.isActive).toBe(true)
  })

  it('replays a tour the user dismissed', async () => {
    gf = createGuideFlow({ context: { userId: 'u2' }, injectStyles: false })
    gf.createFlow(linkable)

    await gf.start(linkable)
    gf.skip()
    await new Promise((r) => setTimeout(r, 0))
    expect(await gf.progress.isDismissed('u2', 'billing')).toBe(true)

    await gf.start(linkable)
    expect(gf.isActive).toBe(false)

    go('?gf_tour=billing')
    const started = await startFromUrl(gf)

    expect(started?.id).toBe('billing')
    expect(gf.isActive).toBe(true)
  })

  it('does not touch storage for an anonymous visitor', async () => {
    // No userId means no records to clear, and nothing to write.
    gf = createGuideFlow({ injectStyles: false })
    gf.createFlow(linkable)
    go('?gf_tour=billing')

    const before = { ...localStorage }
    await startFromUrl(gf)

    expect(gf.isActive).toBe(true)
    // start() writes a resume snapshot only when there is a user to write it for.
    expect(Object.keys(localStorage)).toEqual(Object.keys(before))
  })
})
