/**
 * @guideflow/checklist — a docked onboarding checklist for GuideFlow.js
 *
 * A checklist is a PROJECTION of data that already exists. Items backed by a
 * flow read `ProgressStore`'s completed-flows array and are never written to
 * it; everything else lives in the checklist's own record. There is no second
 * source of truth to drift.
 *
 * The headless controller is this entry point. The widget lives at
 * `@guideflow/checklist/widget`, so a host that renders its own list through
 * `subscribe()` / `getSnapshot()` pays none of its bytes.
 *
 * @author John Mugabe
 * @github https://github.com/RealNerdZW
 * @license MIT
 */

export { createChecklist } from './controller.js'
export { deriveChecklist } from './derive.js'
export { SUFFIX as CHECKLIST_STORAGE_SUFFIX } from './store.js'

export type {
  ChecklistController,
  ChecklistDefinition,
  ChecklistEvent,
  ChecklistItem,
  ChecklistItemState,
  ChecklistOptions,
  ChecklistState,
  CreateChecklist,
  DeriveInput,
  DeriveResult,
} from './types.js'
