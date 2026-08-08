// ---------------------------------------------------------------------------
// The Recorder's step-list operations.
//
// These are the part of step editing that is pure logic, and the part where
// being wrong is silent: a duplicate id does not throw where it is created, it
// throws later inside `draftToFlow` and disables Preview and Export with no
// visible cause. Everything about the surrounding UI — the buttons, the focus
// moves, the inspect round-trip — needs four processes and a real browser and
// lives in `apps/e2e/tests-extension/recorder.spec.ts`.
// ---------------------------------------------------------------------------

import { draftToFlow, validateFlow, type FlowDraft, type LinearStep } from '@guideflow/core/authoring';
import { describe, expect, it } from 'vitest';

import type { RecordedStep } from '../messages.js';
import {
  announcementText,
  appendCaptured,
  blankStep,
  conversionIssue,
  insertStepAt,
  LIVE_MARKER,
  moveStep,
  nextAnnouncement,
  nextStepId,
  patchStepAt,
  removeStepAt,
  setTargetById,
} from '../recorder/steps.js';

function step(id: string, title = id): LinearStep {
  return { id, title, target: `#${id}`, placement: 'bottom' };
}

function capture(overrides: Partial<RecordedStep> = {}): RecordedStep {
  return {
    action: 'click',
    selector: '#a',
    label: 'Save',
    tagName: 'button',
    ts: 1,
    ...overrides,
  };
}

/** What the Recorder builds and hands to `validateFlow`. */
function asDraft(steps: LinearStep[]): FlowDraft {
  return { kind: 'guideflow-draft', draftVersion: 1, id: 'tour', name: 'Tour', steps };
}

describe('nextStepId', () => {
  it('numbers from one on an empty list', () => {
    expect(nextStepId([])).toBe('step-1');
  });

  it('skips an id a survivor is still holding', () => {
    // The measured collision: three steps, delete the middle one, and the
    // length-derived id (`step-${2 + 1}`) is the id the third step already has.
    const afterDelete = removeStepAt([step('step-1'), step('step-2'), step('step-3')], 1);
    expect(afterDelete.map((s) => s.id)).toEqual(['step-1', 'step-3']);
    expect(nextStepId(afterDelete)).toBe('step-4');
  });

  it('never returns an id already in use, however the list was assembled', () => {
    const odd = [step('step-3'), step('step-1'), step('step-4'), step('step-2')];
    const id = nextStepId(odd);
    expect(odd.map((s) => s.id)).not.toContain(id);
  });

  it('copes with ids that are not step-N at all', () => {
    // Imported drafts carry whatever ids their author chose.
    expect(nextStepId([step('welcome'), step('billing')])).toBe('step-3');
  });
});

describe('appendCaptured', () => {
  it('gives every captured action a free id, after a deletion', () => {
    const afterDelete = removeStepAt([step('step-1'), step('step-2'), step('step-3')], 1);
    const next = appendCaptured(afterDelete, [capture(), capture({ selector: '#b' })]);

    expect(next.map((s) => s.id)).toEqual(['step-1', 'step-3', 'step-4', 'step-5']);
    expect(new Set(next.map((s) => s.id)).size).toBe(next.length);
    // And the draft the recorder would build out of it still converts. The old
    // id scheme threw here: "duplicate step id \"step-3\"".
    expect(() => draftToFlow(asDraft(next))).not.toThrow();
  });

  it('falls back to a describing title when the element has no label', () => {
    const [added] = appendCaptured([], [capture({ label: '', action: 'input', tagName: 'input' })]);
    expect(added?.title).toBe('input on input');
  });
});

describe('insertStepAt', () => {
  it('inserts in the middle without disturbing the neighbours', () => {
    const list = [step('step-1'), step('step-2')];
    const fresh = blankStep(list);
    const next = insertStepAt(list, 1, fresh);
    expect(next.map((s) => s.id)).toEqual(['step-1', 'step-3', 'step-2']);
  });

  it('clamps an index past either end instead of leaving a hole', () => {
    const list = [step('step-1')];
    expect(insertStepAt(list, 99, blankStep(list))).toHaveLength(2);
    expect(insertStepAt(list, -5, blankStep(list))[0]?.id).toBe('step-2');
  });

  it('does not mutate the array it was given', () => {
    const list = [step('step-1')];
    insertStepAt(list, 0, blankStep(list));
    expect(list).toHaveLength(1);
  });
});

describe('blankStep', () => {
  it('is blank enough that the validator says what is missing', () => {
    const next = insertStepAt([step('step-1')], 1, blankStep([step('step-1')]));
    const result = validateFlow(draftToFlow(asDraft(next)));

    // Not a placeholder title: an empty one is an error the panel renders the
    // instant the step appears, and "New step" would validate clean and ship.
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('step-missing-content');
  });

  it('becomes valid once a title is typed into it', () => {
    const list = insertStepAt([step('step-1')], 1, blankStep([step('step-1')]));
    const typed = patchStepAt(list, 1, { title: 'Then click here', target: '#step-2' });
    expect(validateFlow(draftToFlow(asDraft(typed))).valid).toBe(true);
  });
});

describe('moveStep', () => {
  const list = [step('step-1'), step('step-2'), step('step-3')];

  it('moves a step up', () => {
    expect(moveStep(list, 2, 1).map((s) => s.id)).toEqual(['step-1', 'step-3', 'step-2']);
  });

  it('moves a step down', () => {
    expect(moveStep(list, 0, 2).map((s) => s.id)).toEqual(['step-2', 'step-3', 'step-1']);
  });

  it('is a no-op for an index off either end, rather than dropping a step', () => {
    expect(moveStep(list, 0, -1).map((s) => s.id)).toEqual(['step-1', 'step-2', 'step-3']);
    expect(moveStep(list, 0, 3).map((s) => s.id)).toEqual(['step-1', 'step-2', 'step-3']);
    expect(moveStep(list, 7, 0)).toHaveLength(3);
    expect(moveStep(list, 1, 1).map((s) => s.id)).toEqual(['step-1', 'step-2', 'step-3']);
  });

  it('returns a new array every time, so React sees the change', () => {
    expect(moveStep(list, 1, 1)).not.toBe(list);
    expect(moveStep(list, 0, 1)).not.toBe(list);
  });

  it('reorders the flow the engine will run, not just the display', () => {
    const flow = draftToFlow(asDraft(moveStep(list, 2, 0)));
    // draftToFlow chains s0 → s1 → s2 in list order.
    expect(flow.states['s0']?.steps?.[0]?.id).toBe('step-3');
    expect(flow.states['s2']?.steps?.[0]?.id).toBe('step-2');
  });
});

describe('setTargetById', () => {
  it('re-points exactly one step and leaves its title and body alone', () => {
    const list: LinearStep[] = [
      { id: 'step-1', title: 'Open the menu', body: 'Top left.', target: '#old' },
      { id: 'step-2', title: 'Save', target: '#save' },
    ];
    const next = setTargetById(list, 'step-1', '#new');

    expect(next[0]).toEqual({
      id: 'step-1',
      title: 'Open the menu',
      body: 'Top left.',
      target: '#new',
    });
    expect(next[1]).toEqual(list[1]);
  });

  it('changes nothing when the step was deleted while the user was picking', () => {
    // The reason it is addressed by id: the user asks to re-record step 3, goes
    // to their app, and by the time the click comes back the list may have
    // moved under it. An index would have rewritten a different step.
    const list = [step('step-1'), step('step-2')];
    expect(setTargetById(list, 'step-9', '#new')).toEqual(list);
  });
});

describe('removeStepAt', () => {
  it('removes the addressed step and nothing else', () => {
    const next = removeStepAt([step('step-1'), step('step-2'), step('step-3')], 0);
    expect(next.map((s) => s.id)).toEqual(['step-2', 'step-3']);
  });

  it('ignores an index that is not there', () => {
    expect(removeStepAt([step('step-1')], 4)).toHaveLength(1);
  });
});

describe('patchStepAt', () => {
  it('merges the edit into one step', () => {
    const next = patchStepAt([step('step-1'), step('step-2')], 1, { placement: 'top' });
    expect(next[1]?.placement).toBe('top');
    expect(next[1]?.title).toBe('step-2');
    expect(next[0]?.placement).toBe('bottom');
  });
});

describe('nextAnnouncement', () => {
  // The defect: `setAnnouncement(text)` wrote the string straight into the
  // live region, and React does not touch a text node whose string is
  // unchanged — so a repeated message produced NO DOM mutation and nothing
  // was ever announced the second time. Moving a step down twice in a
  // two-step list says "Moved to position 2 of 2." both times.
  const SAME = 'Moved to position 2 of 2.';

  it('never returns the value the region is already showing', () => {
    const first = nextAnnouncement('', SAME);
    const second = nextAnnouncement(first, SAME);
    // This inequality IS the announcement. Without it the region is inert.
    expect(second).not.toBe(first);
  });

  it('keeps alternating over a long run of identical messages', () => {
    let current = '';
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const before = current;
      current = nextAnnouncement(current, SAME);
      expect(current).not.toBe(before);
      seen.push(current);
    }
    // Every one of them reads as the same sentence to a screen reader.
    expect(seen.map(announcementText)).toEqual(Array<string>(6).fill(SAME));
  });

  it('changes nothing a reader can hear', () => {
    expect(announcementText(nextAnnouncement('', SAME))).toBe(SAME);
    expect(nextAnnouncement('', SAME).replace(LIVE_MARKER, '')).toBe(SAME);
  });

  it('cannot be defeated by feeding the region its own value back', () => {
    // A caller that read the marker back out and passed it in as `text` would
    // otherwise be able to produce two equal values in a row.
    const marked = nextAnnouncement('', SAME);
    expect(marked.endsWith(LIVE_MARKER)).toBe(true);
    expect(nextAnnouncement(marked, marked)).not.toBe(marked);
  });

  it('still differs when the new message is a different one', () => {
    const first = nextAnnouncement('', SAME);
    const second = nextAnnouncement(first, 'Step 1 deleted. 1 left.');
    expect(second).not.toBe(first);
    expect(announcementText(second)).toBe('Step 1 deleted. 1 left.');
  });
});

describe('conversionIssue', () => {
  // The recorder used to report EVERY draftToFlow throw as `duplicate-step-id`
  // with the hint "Give every step a unique id." — a confident, wrong
  // diagnosis for a draft whose ids were all fine.
  it('names a duplicate id when that is genuinely what happened', () => {
    const dupes = [step('step-1'), step('step-1')];
    let thrown: unknown;
    try {
      draftToFlow(asDraft(dupes));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);

    const issue = conversionIssue(thrown);
    expect(issue.code).toBe('duplicate-step-id');
    expect(issue.hint).toBe('Give every step a unique id.');
    expect(issue.message).toContain('duplicate step id');
    expect(issue.severity).toBe('error');
  });

  it('does not claim a duplicate id for the empty-draft throw', () => {
    let thrown: unknown;
    try {
      draftToFlow(asDraft([]));
    } catch (err) {
      thrown = err;
    }
    const issue = conversionIssue(thrown);
    expect(issue.code).toBe('no-states');
    expect(issue.hint).toBe('Add at least one step.');
  });

  it('reports an unrecognised failure as itself rather than guessing', () => {
    const issue = conversionIssue(new TypeError('states.welcome.onEntry is a function'));
    expect(issue.code).not.toBe('duplicate-step-id');
    expect(issue.message).toBe('states.welcome.onEntry is a function');
    // And the hint does not send the user off to check ids that are fine.
    expect(issue.hint).not.toContain('unique id');
  });

  it('survives something that is not an Error at all', () => {
    const issue = conversionIssue('nope');
    expect(issue.message).toBe('The draft could not be converted to a flow.');
    expect(issue.severity).toBe('error');
    expect(issue.path).toBe('');
  });
});
