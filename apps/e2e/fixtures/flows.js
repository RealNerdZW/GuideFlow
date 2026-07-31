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

/** @type {Record<string, FlowDefinition>} */
export const flows = { basic, final, scroll, persisted, multistate }
