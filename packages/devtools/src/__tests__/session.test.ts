// ---------------------------------------------------------------------------
// Draft persistence and the legacy-record migration.
//
// `toDraftState` is the one piece of the Recorder that is pure logic, and it is
// the compatibility boundary: every tour saved by the old Builder tab is in the
// flat `{ id, name, steps: StepDraft[] }` shape, and it has to keep opening.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearDraft, flushDraft, loadDraft, saveDraft, toDraftState } from '../recorder/session.js';

/** A minimal chrome.storage.session stand-in. */
function stubChrome(): Map<string, unknown> {
  const store = new Map<string, unknown>();
  const session = {
    get: vi.fn((key: string) =>
      Promise.resolve(store.has(key) ? { [key]: store.get(key) } : {}),
    ),
    set: vi.fn((items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
      return Promise.resolve();
    }),
    remove: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
  vi.stubGlobal('chrome', { storage: { session } });
  return store;
}

beforeEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('draft persistence', () => {
  it('flushes immediately, without waiting for the debounce', () => {
    // The reason this exists: closing the Recorder within the debounce window
    // used to lose the last edit, and closing a tab is exactly when a user
    // expects their work to be kept.
    const store = stubChrome();
    flushDraft(7, { name: 'My tour', steps: [{ id: 's1', title: 'One' }] });
    expect(store.get('gf_draft_7')).toEqual({
      name: 'My tour',
      steps: [{ id: 's1', title: 'One' }],
    });
  });

  it('round-trips through load', async () => {
    stubChrome();
    flushDraft(7, { name: 'Round trip', steps: [{ id: 's1', title: 'One' }] });
    expect(await loadDraft(7)).toEqual({ name: 'Round trip', steps: [{ id: 's1', title: 'One' }] });
  });

  it('debounces repeated saves into one write', () => {
    vi.useFakeTimers();
    const store = stubChrome();
    saveDraft(1, { name: 'a', steps: [] });
    saveDraft(1, { name: 'ab', steps: [] });
    saveDraft(1, { name: 'abc', steps: [] });
    expect(store.has('gf_draft_1')).toBe(false);
    vi.advanceTimersByTime(400);
    expect((store.get('gf_draft_1') as { name: string }).name).toBe('abc');
  });

  it('returns null rather than throwing when there is nothing stored', async () => {
    stubChrome();
    expect(await loadDraft(99)).toBeNull();
  });

  it('returns null for a stored value that is not a draft', async () => {
    const store = stubChrome();
    store.set('gf_draft_5', { name: 'x' }); // no steps array
    expect(await loadDraft(5)).toBeNull();
  });

  it('clears', async () => {
    const store = stubChrome();
    flushDraft(3, { name: 'x', steps: [{ id: 's', title: 't' }] });
    await clearDraft(3);
    expect(store.has('gf_draft_3')).toBe(false);
  });

  it('survives storage being unavailable', async () => {
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: () => Promise.reject(new Error('no session storage')),
          set: () => Promise.reject(new Error('no session storage')),
          remove: () => Promise.reject(new Error('no session storage')),
        },
      },
    });
    // A lost draft is better than a Recorder that will not open.
    await expect(loadDraft(1)).resolves.toBeNull();
    await expect(clearDraft(1)).resolves.toBeUndefined();
  });
});

describe('toDraftState — the legacy migration', () => {
  it('opens a record written by the old Builder tab', () => {
    // The flat `{ id, name, steps: StepDraft[] }` shape, where StepDraft was
    // `{ id, title, body, target?, placement }`.
    const legacy = {
      id: 'old-tour',
      name: 'Old tour',
      steps: [
        { id: 'step-1', title: 'One', body: 'first', target: '#a', placement: 'bottom' },
        { id: 'step-2', title: 'Two', body: '', target: '#b', placement: 'top' },
      ],
      savedAt: 1,
    };
    expect(toDraftState(legacy)).toEqual({
      name: 'Old tour',
      steps: [
        { id: 'step-1', title: 'One', body: 'first', target: '#a', placement: 'bottom' },
        // An empty body is dropped rather than carried as ''.
        { id: 'step-2', title: 'Two', target: '#b', placement: 'top' },
      ],
    });
  });

  it('opens a current FlowDraft', () => {
    const draft = {
      kind: 'guideflow-draft',
      draftVersion: 1,
      id: 'new',
      name: 'New tour',
      steps: [{ id: 's1', title: 'One', target: '#a' }],
    };
    expect(toDraftState(draft)?.steps).toHaveLength(1);
  });

  it('falls back to the id when there is no name', () => {
    expect(toDraftState({ id: 'just-an-id', steps: [{ id: 's', title: 't' }] })?.name).toBe(
      'just-an-id',
    );
  });

  it('skips malformed steps rather than importing them', () => {
    const result = toDraftState({
      name: 'Mixed',
      steps: [
        { id: 's1', title: 'Good' },
        { title: 'No id' },
        null,
        'not an object',
        { id: 's2' },
      ],
    });
    expect(result?.steps).toEqual([{ id: 's1', title: 'Good' }]);
  });

  it('returns null when nothing usable survives', () => {
    expect(toDraftState({ name: 'x', steps: [{ nope: true }] })).toBeNull();
    expect(toDraftState({ name: 'x', steps: [] })).toBeNull();
    expect(toDraftState({ name: 'x' })).toBeNull();
    expect(toDraftState(null)).toBeNull();
    expect(toDraftState('a string')).toBeNull();
  });
});
