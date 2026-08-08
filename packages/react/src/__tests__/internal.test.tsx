// ---------------------------------------------------------------------------
// The three internal modules nothing else reaches directly: the once-only
// warning helper, the external store behind every hook, and the SSR fork.
//
// These are small, but each of them decides something that only shows up in an
// environment the rest of the suite never runs in — production, a first read
// before any subscription, or a server with no DOM.
//
// What is deliberately left uncovered across this package, and why:
//
//   * The `: null` / `return` half of five `typeof document === 'undefined'`
//     guards (GuidePopover 158 and 449, ConversationalPanel 73 and 147). happy-dom
//     always has a document, and stubbing one out per call site would assert the
//     stub rather than the guard. The one place the SSR fork is genuinely
//     decidable — `useIsomorphicLayoutEffect`, where it is a module-level
//     constant — is exercised below by re-evaluating the module without a window.
//   * Three `if (!el) return` ref guards (GuidePopover 110, 174, 207). The div
//     carrying the ref renders in the same commit as the state that gates each
//     of them, and the scroll/resize listeners are removed when that state
//     clears, so no ordering reaches them.
//   * `context.tsx:137`, the StrictMode double-cleanup guard. `ownedRef.current`
//     is only ever cleared by a cleanup, so a second cleanup closing over a
//     stale value cannot run after a *different* value has been installed. It is
//     defence against a future refactor, not a live path.
//   * One v8 range on `ConversationalPanel:93` (`!question || loading`). Both
//     operands are exercised — the "second question while thinking" test proves
//     React state reached the handler, because the Send button re-enables — but
//     the remapped range never closes. Source-map artefact, not a gap.
// ---------------------------------------------------------------------------

import { createGuideFlow, type FlowDefinition, type GuideFlowInstance } from '@guideflow/core'
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TourProvider } from '../context.js'
import { useTourStep } from '../hooks/use-tour-step.js'
import { useTour } from '../hooks/use-tour.js'
import { resetWarnOnce, warnOnce } from '../internal/dev.js'
import { createTourStore } from '../internal/tour-store.js'

const flow: FlowDefinition = {
  id: 'internal-flow',
  initial: 'a',
  states: {
    a: {
      steps: [
        { id: 's1', content: { title: 'One' } },
        { id: 's2', content: { title: 'Two' } },
      ],
      final: true,
    },
  },
}

let gf: GuideFlowInstance

beforeEach(() => {
  resetWarnOnce()
  gf = createGuideFlow()
})

afterEach(() => {
  cleanup()
  gf.destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

// ── warnOnce ────────────────────────────────────────────────────────────────

describe('warnOnce', () => {
  it('says nothing in production, and does not burn the key doing it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const original = process.env['NODE_ENV']

    process.env['NODE_ENV'] = 'production'
    try {
      warnOnce('prod-key', 'configuration is wrong')
    } finally {
      process.env['NODE_ENV'] = original
    }
    expect(warn).not.toHaveBeenCalled()

    // The key must be recorded *after* the production check, not before —
    // recording it first would silence the warning for every developer whose
    // bundle happened to run one production build first.
    warnOnce('prod-key', 'configuration is wrong')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('configuration is wrong')
  })

  it('emits at most once per key outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    warnOnce('repeat-key', 'first')
    warnOnce('repeat-key', 'second')

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('first')
  })
})

// ── the external store ──────────────────────────────────────────────────────

describe('createTourStore', () => {
  it('recomputes on getSnapshot instead of trusting the cached value', async () => {
    const store = createTourStore(gf)
    expect(store.getSnapshot().isActive).toBe(false)

    // Nothing has subscribed, so the store holds no engine listeners and its
    // cache was never refreshed — exactly the window React reads in between
    // rendering and installing the subscription.
    await gf.start(flow)

    const snapshot = store.getSnapshot()
    expect(snapshot.isActive).toBe(true)
    expect(snapshot.currentStepId).toBe('s1')
    expect(snapshot.totalSteps).toBe(2)
  })

  it('keeps snapshot identity stable while nothing changes', async () => {
    const store = createTourStore(gf)
    await gf.start(flow)

    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('reports an idle tour to the server, with a stable reference', async () => {
    const store = createTourStore(gf)
    await gf.start(flow)

    const server = store.getServerSnapshot()
    // A live tour on the client must not leak into the server render, or
    // hydration mismatches; and useSyncExternalStore re-renders forever if the
    // server snapshot is a fresh object each call.
    expect(server.isActive).toBe(false)
    expect(server.currentStepId).toBeNull()
    expect(server.totalSteps).toBe(0)
    expect(store.getServerSnapshot()).toBe(server)
  })
})

// ── SSR ─────────────────────────────────────────────────────────────────────

describe('server rendering', () => {
  function Consumer(): React.JSX.Element {
    const { isActive, currentStepIndex, totalSteps } = useTour()
    const step = useTourStep('s1')
    return (
      <div>
        <span id="tour">{`${String(isActive)}:${currentStepIndex}/${totalSteps}`}</span>
        <span id="step">{String(step.isActive)}</span>
      </div>
    )
  }

  it('renders an idle tour even while one is running on the client', async () => {
    await gf.start(flow)
    expect(gf.isActive).toBe(true)

    const html = renderToString(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    // Both hooks take the server snapshot path. If either read the live
    // instance instead, the markup React sent would not match what it hydrates.
    expect(html).toContain('false:0/0')
    expect(html).toContain('>false<')
  })

  it('agrees with the client once mounted', async () => {
    await gf.start(flow)

    render(
      <TourProvider instance={gf}>
        <Consumer />
      </TourProvider>,
    )

    expect(document.getElementById('tour')?.textContent).toBe('true:0/2')
    expect(document.getElementById('step')?.textContent).toBe('true')
  })
})

// ── the isomorphic layout effect ────────────────────────────────────────────

describe('useIsomorphicLayoutEffect', () => {
  it('is useLayoutEffect in a browser and useEffect without a window', async () => {
    const react = await import('react')
    const browser = await import('../internal/use-isomorphic-layout-effect.js')
    expect(browser.useIsomorphicLayoutEffect).toBe(react.useLayoutEffect)

    // The fork is decided once, at module evaluation, so the only honest way to
    // exercise the other arm is to evaluate the module again with no `window`
    // — which is what Next.js, Nuxt and SvelteKit do on every request. React
    // warns that a layout effect does nothing there.
    const globals = globalThis as { window?: unknown }
    const savedWindow = globals.window
    vi.resetModules()
    delete globals.window
    try {
      const serverReact = await import('react')
      const server = await import('../internal/use-isomorphic-layout-effect.js')
      expect(server.useIsomorphicLayoutEffect).toBe(serverReact.useEffect)
      expect(server.useIsomorphicLayoutEffect).not.toBe(serverReact.useLayoutEffect)
    } finally {
      globals.window = savedWindow
      vi.resetModules()
    }
  })
})
