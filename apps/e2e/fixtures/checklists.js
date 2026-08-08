// ---------------------------------------------------------------------------
// Checklist definitions for the Playwright fixture.
//
// A separate ES module so there is exactly ONE definition of these lists:
// index.html imports it in the browser, and
// packages/checklist/src/__tests__/e2e-fixture.test.ts imports the same file to
// assert they still satisfy the ChecklistDefinition contract. Same trick
// flows.js already uses — the fixture and the unit contract cannot drift.
//
// Plain JS with JSDoc types rather than TS: the browser loads this file
// directly from the static server, with no build step in between.
// ---------------------------------------------------------------------------

/** @typedef {import('@guideflow/checklist').ChecklistDefinition} ChecklistDefinition */

/**
 * Three items covering every row state the specs assert on: flow-backed,
 * manual, and blocked by a `requires` chain.
 *
 * @type {ChecklistDefinition}
 */
export const gettingStarted = {
  id: 'e2e-getting-started',
  title: 'Getting started',
  version: 1,
  items: [
    {
      id: 'tour',
      title: 'Take the tour',
      description: 'A two-step walkthrough',
      flowId: 'fixture-tour',
    },
    { id: 'data', title: 'Connect your data' },
    { id: 'billing', title: 'Connect billing', requires: ['data'] },
  ],
}

/** Every item already satisfiable, for the hide-when-complete path. */
/** @type {ChecklistDefinition} */
export const shortList = {
  id: 'e2e-short',
  title: 'Almost done',
  version: 1,
  items: [{ id: 'only', title: 'The only item' }],
}

export const checklists = { gettingStarted, shortList }
