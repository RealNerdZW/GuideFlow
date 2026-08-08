// ---------------------------------------------------------------------------
// Flow definitions for the Playwright fixture.
//
// A separate ES module so there is exactly ONE definition of these flows:
// index.html imports it in the browser, and
// packages/core/src/__tests__/e2e-fixture.test.ts imports the same file to
// assert they still satisfy the engine contract. The previous fixture inlined
// an invalid flow shape that nothing validated, which is one of the reasons the
// e2e suite had never run.
//
// Plain JS with JSDoc types rather than TS: the browser loads this file
// directly from the static server, with no build step in between.
// ---------------------------------------------------------------------------

/** @typedef {import('@guideflow/core').FlowDefinition} FlowDefinition */

/** @type {FlowDefinition} */
export const basic = {
  id: 'fixture-tour',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 's1', target: '#step-one', placement: 'bottom', content: { title: 'Step One', body: 'This is step one.' } },
        { id: 's2', target: '#step-two', placement: 'right', content: { title: 'Step Two', body: 'This is step two.' } },
        { id: 's3', target: '#step-three', placement: 'top', content: { title: 'Step Three', body: 'This is step three.' } },
      ],
      final: true,
    },
  },
}

/**
 * Mirrors the README quick-start: one final state holding two steps.
 * Regression cover for `final-state-steps-never-rendered`, which truncated this
 * exact shape to a single step.
 * @type {FlowDefinition}
 */
export const final = {
  id: 'fixture-final',
  initial: 'intro',
  states: {
    intro: {
      steps: [
        { id: 'f1', target: '#step-one', content: { title: 'Welcome!', body: 'This is your dashboard.' } },
        { id: 'f2', target: '#step-two', content: { title: 'Your profile', body: 'Manage your account here.' } },
      ],
      final: true,
    },
  },
}

/**
 * Anchored ~1600px down the page. Regression cover for
 * `popover-viewport-coordinate-mismatch`, which collapsed the popover to a
 * clamped centre as soon as the page was scrolled.
 * @type {FlowDefinition}
 */
export const scroll = {
  id: 'fixture-scroll',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 'sc1', target: '#far-target', placement: 'bottom', content: { title: 'Far Step', body: 'Anchored below the fold.' } },
      ],
      final: true,
    },
  },
}

/** @type {FlowDefinition} */
export const persisted = {
  id: 'fixture-persisted',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 'p1', target: '#step-one', content: { title: 'Persisted One', body: 'First.' } },
        { id: 'p2', target: '#step-two', content: { title: 'Persisted Two', body: 'Second.' } },
        { id: 'p3', target: '#step-three', content: { title: 'Persisted Three', body: 'Third.' } },
      ],
      final: true,
    },
  },
}

/**
 * Two states joined by a NEXT transition — cover for cross-state prev()/goTo().
 * @type {FlowDefinition}
 */
export const multistate = {
  id: 'fixture-multistate',
  initial: 'first',
  states: {
    first: {
      steps: [{ id: 'm1', target: '#step-one', content: { title: 'State One', body: 'In the first state.' } }],
      on: { NEXT: 'second' },
    },
    second: {
      steps: [{ id: 'm2', target: '#step-two', content: { title: 'State Two', body: 'In the second state.' } }],
      final: true,
    },
  },
}

/**
 * `clickThrough: true` — the user is meant to click the highlighted button.
 * Regression cover for `clickthrough-exposes-whole-page`: this used to drop
 * pointer capture for the WHOLE page rather than exposing the target.
 * @type {FlowDefinition}
 */
export const clickThrough = {
  id: 'fixture-clickthrough',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'ct1',
          target: '#clickable-target',
          placement: 'bottom',
          clickThrough: true,
          content: { title: 'Click Through', body: 'Go on, click it.' },
        },
      ],
      final: true,
    },
  },
}

/** The same step without clickThrough — the target must NOT be reachable. @type {FlowDefinition} */
export const blocking = {
  id: 'fixture-blocking',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'bl1',
          target: '#clickable-target',
          placement: 'bottom',
          content: { title: 'Blocking', body: 'The overlay is in the way.' },
        },
      ],
      final: true,
    },
  },
}

/**
 * Two states on two routes. Regression cover for `no-spa-route-change-handling`,
 * the last of the audit's P0s: a step whose target lived on another route
 * resolved to null and rendered as a centred modal with no spotlight, silently.
 *
 * `route` sits on the STATE, not the step — a ROUTE transition would put the
 * target state off FlowMachine's NEXT-only default path and reintroduce the
 * per-state counter bug.
 * @type {FlowDefinition}
 */
export const routed = {
  id: 'fixture-routed',
  initial: 'home',
  states: {
    home: {
      route: '/apps/e2e/fixtures/index.html',
      steps: [
        { id: 'r1', target: '#route-home-target', content: { title: 'On Home', body: 'Now go to settings.' } },
      ],
      on: { NEXT: 'settings' },
    },
    settings: {
      route: '/apps/e2e/fixtures/index.html?view=settings',
      steps: [
        { id: 'r2', target: '#route-settings-target', content: { title: 'On Settings', body: 'You made it.' } },
      ],
      final: true,
    },
  },
}

/**
 * A step whose target never arrives — cover for the timeout path. The engine
 * emits `step:timeout` and renders the step UNANCHORED; it does not skip and
 * does not end. Policy composes in userland.
 * @type {FlowDefinition}
 */
export const missingTarget = {
  id: 'fixture-missing-target',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 'mt1', target: '#never-appears', waitForTarget: 600, content: { title: 'Waiting', body: 'This target never arrives.' } },
      ],
      final: true,
    },
  },
}

/**
 * Two clickThrough steps on the same control, driven by `advanceOn` rather than
 * by the Next button. Proves the half of ADR-004 that was missing for five
 * phases: the user could click the spotlit element and the tour did not notice.
 *
 * Only real in a browser — happy-dom has no layout engine and no `clip-path`
 * hit-testing, so a unit test cannot tell a carved hole from a solid overlay.
 * @type {FlowDefinition}
 */
export const advance = {
  id: 'fixture-advance',
  initial: 'main',
  states: {
    main: {
      steps: [
        {
          id: 'av1',
          target: '#clickable-target',
          placement: 'bottom',
          clickThrough: true,
          content: { title: 'Step one', body: 'Click the button to continue.' },
        },
        {
          id: 'av2',
          target: '#clickable-target',
          placement: 'bottom',
          clickThrough: true,
          content: { title: 'Step two', body: 'Click it again to finish.' },
        },
      ],
      final: true,
    },
  },
}

/**
 * Opted in to `?gf_tour=`. The stripping half of that feature can only be
 * observed here: happy-dom's `history.replaceState` does not move
 * `location.href` at all, so a unit test can assert the call and not the result.
 * @type {FlowDefinition}
 */
export const deepLinked = {
  id: 'fixture-deeplink',
  initial: 'main',
  states: {
    main: {
      steps: [
        { id: 'dl1', target: '#step-one', content: { title: 'Linked one' } },
        { id: 'dl2', target: '#step-two', content: { title: 'Linked two' } },
      ],
      final: true,
    },
  },
  targeting: { deepLink: true },
}

/** Registered, never marked linkable — a crafted link must not reach it. @type {FlowDefinition} */
export const notLinked = {
  id: 'fixture-not-linked',
  initial: 'main',
  states: {
    main: { steps: [{ id: 'nl1', target: '#step-one', content: { title: 'Private' } }], final: true },
  },
}

/** @type {Record<string, FlowDefinition>} */
export const flows = {
  basic, final, scroll, persisted, multistate, clickThrough, blocking, routed, missingTarget,
  advance, deepLinked, notLinked,
}
