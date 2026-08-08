/**
 * Draft persistence for the Recorder.
 *
 * The Builder tab this replaces kept its steps in React state inside a
 * conditionally-mounted component, so switching to the Events tab destroyed
 * every unsaved step. The Recorder is its own page and cannot be unmounted
 * that way — but a page can still be closed or reloaded, so the draft is
 * mirrored into `chrome.storage.session`.
 *
 * `session` rather than `local`: a half-finished tour draft is an editing
 * session, not a document. It should survive a reload and an evicted service
 * worker, and it should not still be there next week.
 */
import type { FlowDraft, LinearStep } from '@guideflow/core/authoring';

const KEY_PREFIX = 'gf_draft_';
const SAVE_DEBOUNCE_MS = 300;

export interface DraftState {
  name: string;
  steps: LinearStep[];
}

const keyFor = (tabId: number): string => `${KEY_PREFIX}${String(tabId)}`;

let timer: ReturnType<typeof setTimeout> | undefined;

/** Persist the draft, debounced. Safe to call on every keystroke. */
export function saveDraft(tabId: number, state: DraftState): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void chrome.storage.session.set({ [keyFor(tabId)]: state });
  }, SAVE_DEBOUNCE_MS);
}

/** Read the draft back. Returns null when there is nothing, or nothing usable. */
export async function loadDraft(tabId: number): Promise<DraftState | null> {
  try {
    const items = await chrome.storage.session.get(keyFor(tabId));
    const raw: unknown = items[keyFor(tabId)];
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Partial<DraftState>;
    if (!Array.isArray(candidate.steps)) return null;
    return { name: typeof candidate.name === 'string' ? candidate.name : '', steps: candidate.steps };
  } catch {
    // storage.session is unavailable in some contexts; a lost draft is better
    // than a Recorder that will not open.
    return null;
  }
}

/**
 * Write any pending debounced draft immediately.
 *
 * Without this, closing the Recorder within 300 ms of the last keystroke loses
 * that keystroke — and closing a tab is exactly the moment a user expects
 * their work to be kept.
 */
export function flushDraft(tabId: number, state: DraftState): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  void chrome.storage.session.set({ [keyFor(tabId)]: state });
}

export async function clearDraft(tabId: number): Promise<void> {
  try {
    await chrome.storage.session.remove(keyFor(tabId));
  } catch {
    /* nothing to do */
  }
}

/**
 * Turn a saved record into a draft the Recorder can open.
 *
 * Accepts the current `FlowDraft`, and migrates the legacy flat
 * `{ id, name, steps: StepDraft[] }` shape the Builder tab used to write —
 * `StepDraft` was `{ id, title, body, target?, placement }`, which is
 * `LinearStep`-compatible apart from `placement` being a bare string.
 */
export function toDraftState(record: unknown): DraftState | null {
  if (!record || typeof record !== 'object') return null;
  const r = record as Partial<FlowDraft> & { name?: string; steps?: unknown };
  if (!Array.isArray(r.steps)) return null;
  const steps: LinearStep[] = [];
  for (const raw of r.steps) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as unknown as Record<string, unknown>;
    if (typeof step['id'] !== 'string' || typeof step['title'] !== 'string') continue;
    steps.push({
      id: step['id'],
      title: step['title'],
      ...(typeof step['body'] === 'string' && step['body'].length > 0 && { body: step['body'] }),
      ...(typeof step['target'] === 'string' && { target: step['target'] }),
      ...(typeof step['placement'] === 'string' && {
        placement: step['placement'] as NonNullable<LinearStep['placement']>,
      }),
    });
  }
  if (steps.length === 0) return null;
  return { name: typeof r.name === 'string' ? r.name : (r.id ?? ''), steps };
}
