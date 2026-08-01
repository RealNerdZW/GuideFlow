/**
 * The extension's message vocabulary, in one place.
 *
 * Five processes exchange these — page bridge, content script, service worker,
 * DevTools panel, popup and now the Recorder — and until this file existed
 * every one of them spelled the names out as string literals. That is how
 * `GF_SET_DEBUG` came to be sent by the panel and handled by nobody, and how
 * `tour:dismiss` went missing from two of the seven hand-maintained event
 * arrays. A typo in a string literal is silence, not an error.
 *
 * Types only plus two frozen lists: this module must stay free of `chrome.*`
 * so the page-world bridge can import it too.
 */

// ── Recording ──────────────────────────────────────────────────────────────

/**
 * A user interaction captured by the content-script recorder.
 *
 * Field *contents* are deliberately absent — see `onRecordInput` in
 * `content/inspector.ts`. `selector` carries the full result from
 * `@guideflow/core/selector` so the Recorder can show confidence and refuse a
 * step whose selector was never proven unique.
 */
export interface RecordedStep {
  action: string
  selector: string
  label: string
  tagName: string
  ts: number
  /** From `SelectorResult`. Absent on steps recorded before this shipped. */
  confidence?: 'stable' | 'semantic' | 'fragile'
  unique?: boolean
  warnings?: string[]
}

/** What the service worker knows about a tab's recording session. */
export interface RecordingState {
  recording: boolean
  steps: RecordedStep[]
}

// ── Message names ──────────────────────────────────────────────────────────

/**
 * Commands an extension page sends to a tab's content script.
 *
 * Every one of these is routed through the service worker rather than sent
 * directly with `chrome.tabs.sendMessage`, so there is one place that knows
 * which tab a message is for and one place that reports a failure.
 */
export const TAB_COMMANDS = [
  'GF_START_INSPECT',
  'GF_STOP_INSPECT',
  'GF_START_RECORDING',
  'GF_STOP_RECORDING',
  'GF_HIGHLIGHT_SELECTOR',
  'GF_VERIFY_SELECTOR',
  'GF_START_TOUR',
  'GF_STOP_TOUR',
  'GF_LIST_FLOWS',
  'GF_DEVTOOLS_OPEN',
] as const

export type TabCommand = (typeof TAB_COMMANDS)[number]

/**
 * Reports a content script may send to the service worker.
 *
 * This is the allowlist the provenance gate enforces: a content script may
 * report tab state and may be relayed to that tab's extension pages, and may
 * never touch storage.
 */
export const TAB_REPORTS = [
  'GF_DETECTED',
  'GF_FLOWS_LIST',
  'GF_TOUR_EVENT',
  'GF_ACTIVE_TOUR_STATE',
  'GF_ELEMENT_SELECTED',
  'GF_QUICK_TOUR_ELEMENT',
  'GF_RECORDED_STEP',
  'GF_RECORDING_STARTED',
  'GF_RECORDING_STOPPED',
  'GF_INSPECT_STARTED',
  'GF_INSPECT_STOPPED',
  'GF_SELECTOR_VERIFIED',
] as const

export type TabReport = (typeof TAB_REPORTS)[number]

/** Requests only an extension page may make of the service worker. */
export type PrivilegedRequest =
  | 'GF_GET_STATE'
  | 'GF_SAVE_FLOW'
  | 'GF_LOAD_FLOWS'
  | 'GF_DELETE_FLOW'
  | 'GF_OPEN_RECORDER'
  | 'GF_GET_RECORDING'
  | 'GF_CLEAR_RECORDING'
  | 'GF_SEND_TO_TAB'

/** The envelope every message uses. */
export interface Envelope<T = unknown> {
  type: string
  payload?: T
}

/** Port names the service worker accepts, by prefix. */
export const PORT_DEVTOOLS = 'devtools:'
export const PORT_RECORDER = 'recorder:'

/** Storage key namespaces. Both are swept by the panel's "Clear all data". */
export const FLOW_KEY_PREFIX = 'gf_flow_'
export const SETTINGS_KEY = 'gf_settings'
