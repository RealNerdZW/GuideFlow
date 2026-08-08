/**
 * The Recorder's pure logic — step-list operations, the live-region marker,
 * and the reading of a failed draft conversion.
 *
 * They live here rather than inline in `App.tsx` because they are the part of
 * step editing a unit test can honestly own: no `chrome.*`, no React, no DOM.
 * Everything else about the Recorder needs four processes and a real browser,
 * which is what `apps/e2e/tests-extension` is for — see the note above
 * `coverage.include` in `vitest.config.ts`.
 *
 * Every list operation returns a NEW array. The list is React state, and a
 * mutated-in-place array is a re-render that never happens.
 */
import type { FlowIssue, FlowIssueCode, LinearStep } from '@guideflow/core/authoring';

import type { RecordedStep } from '../messages.js';

// ── Ids ────────────────────────────────────────────────────────────────────

/**
 * A `step-N` id that no step in `steps` is already using.
 *
 * Deriving the id from the list length alone — which is what `importCaptured`
 * did — is only safe while steps arrive in one direction. The moment a step
 * can be deleted or inserted it collides: delete `step-2` out of three steps
 * and the next length-derived id is `step-3`, which is still there. A
 * duplicate id is not cosmetic. `draftToFlow` THROWS on it, `validateFlow`
 * grades it `duplicate-step-id` (error), and the recorder disables Preview and
 * Export — so the draft becomes unshippable with no visible cause.
 *
 * The scan terminates: at most `steps.length` ids are taken, so somewhere in
 * the `steps.length + 1` candidates from `steps.length + 1` upwards there is a
 * free one.
 */
export function nextStepId(steps: readonly LinearStep[]): string {
  const taken = new Set(steps.map((s) => s.id));
  let n = steps.length + 1;
  while (taken.has(`step-${String(n)}`)) n += 1;
  return `step-${String(n)}`;
}

// ── Editing ────────────────────────────────────────────────────────────────

/**
 * A blank step, ready to be typed into, carrying an id nothing else holds.
 *
 * Deliberately blank rather than pre-filled with a plausible title: an empty
 * title is a `step-missing-content` error, so the validation panel names what
 * is missing the instant the step appears. A placeholder title would validate
 * clean and ship the word "New step" to real users.
 */
export function blankStep(steps: readonly LinearStep[]): LinearStep {
  return { id: nextStepId(steps), title: '', target: null, placement: 'bottom' };
}

/** Insert `step` at `index`, clamped to the ends. */
export function insertStepAt(
  steps: readonly LinearStep[],
  index: number,
  step: LinearStep,
): LinearStep[] {
  const at = Math.max(0, Math.min(index, steps.length));
  const next = [...steps];
  next.splice(at, 0, step);
  return next;
}

/** Remove the step at `index`. An out-of-range index changes nothing. */
export function removeStepAt(steps: readonly LinearStep[], index: number): LinearStep[] {
  return steps.filter((_, i) => i !== index);
}

/** Move the step at `from` to `to`. An out-of-range index changes nothing. */
export function moveStep(steps: readonly LinearStep[], from: number, to: number): LinearStep[] {
  const next = [...steps];
  if (from === to) return next;
  if (from < 0 || from >= steps.length) return next;
  if (to < 0 || to >= steps.length) return next;
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}

/**
 * Point one step at a different element, addressed by id rather than index.
 *
 * By id because the two events are separated by a trip through the page: the
 * user asks to re-record step 3, then goes to their app and clicks. Nothing
 * stops them reordering or deleting a step in between, and an index captured
 * before that would rewrite a different step's target.
 */
export function setTargetById(
  steps: readonly LinearStep[],
  id: string,
  target: string,
): LinearStep[] {
  return steps.map((s) => (s.id === id ? { ...s, target } : s));
}

/** Apply an edit to the step at `index`. */
export function patchStepAt(
  steps: readonly LinearStep[],
  index: number,
  edit: Partial<LinearStep>,
): LinearStep[] {
  return steps.map((s, i) => (i === index ? { ...s, ...edit } : s));
}

// ── Capture ────────────────────────────────────────────────────────────────

/**
 * Append captured actions to the draft as steps.
 *
 * `nextStepId` is re-evaluated against the growing list rather than computed
 * once, so two captured actions cannot be handed the same id either.
 */
export function appendCaptured(
  steps: readonly LinearStep[],
  captured: readonly RecordedStep[],
): LinearStep[] {
  const next = [...steps];
  for (const c of captured) {
    next.push({
      id: nextStepId(next),
      title: c.label || `${c.action} on ${c.tagName}`,
      target: c.selector,
      placement: 'bottom',
    });
  }
  return next;
}

// ── The live region ────────────────────────────────────────────────────────

/**
 * A zero-width space, appended to every other announcement.
 *
 * Not decoration. The Recorder's live region is rendered as `{announcement}`,
 * so React writes the string into a text node — and React does not touch a
 * text node whose string is unchanged. Two IDENTICAL consecutive messages
 * therefore produce **no DOM mutation at all**, and an assistive technology
 * that is watching for one hears the first and nothing after it. Moving a step
 * down twice in a two-step list says "Moved to position 2 of 2." both times;
 * only the first was ever announced.
 *
 * U+200B has no width, no spoken output and does not break a line, so the
 * sentence a reader hears is unchanged while the node a reader watches
 * genuinely changes. Anything visible — a counter, a trailing full stop —
 * would be read out.
 */
export const LIVE_MARKER = '\u200B';

/**
 * The next value for the live region, given the value it is showing.
 *
 * Guaranteed to differ from `previous` for ANY `text`, including one equal to
 * what is already there: the marker is present on exactly one of the two.
 * `text` is stripped of markers first, so a caller cannot defeat the alternation
 * by passing a value that came back out of the region.
 */
export function nextAnnouncement(previous: string, text: string): string {
  const clean = text.split(LIVE_MARKER).join('');
  return previous.endsWith(LIVE_MARKER) ? clean : clean + LIVE_MARKER;
}

/** The sentence a reader hears, with the invisible marker taken back off. */
export function announcementText(value: string): string {
  return value.split(LIVE_MARKER).join('');
}

// ── Reading a failed conversion ────────────────────────────────────────────

/**
 * Known conversion failures, most specific first.
 *
 * `draftToFlow` throws for more than one reason, and the Recorder used to
 * report every one of them as `duplicate-step-id` with the hint "Give every
 * step a unique id." — a confident, wrong diagnosis for a draft whose ids are
 * all fine. Matching on the message is not elegant, but the alternative is
 * inventing a `FlowIssueCode` in `core` for the benefit of one panel.
 */
const CONVERSION_FAILURES: ReadonlyArray<{
  match: RegExp;
  code: FlowIssueCode;
  hint: string;
}> = [
  { match: /duplicate step id/i, code: 'duplicate-step-id', hint: 'Give every step a unique id.' },
  { match: /at least one step/i, code: 'no-states', hint: 'Add at least one step.' },
];

/**
 * Turn whatever `draftToFlow` (or `validateFlow`) threw into one honest issue.
 *
 * The message is always the thrown one. Only the code and the hint are
 * inferred, and when nothing matches they say so instead of guessing: the
 * catch-all is `not-an-object`, which is the same code `flowToDraft` uses when
 * it refuses for a reason it has no dedicated code for.
 */
export function conversionIssue(err: unknown): FlowIssue {
  const message = err instanceof Error ? err.message : 'The draft could not be converted to a flow.';
  const known = CONVERSION_FAILURES.find((f) => f.match.test(message));
  return {
    code: known?.code ?? 'not-an-object',
    severity: 'error',
    path: '',
    message,
    hint: known?.hint ?? 'This draft cannot be converted to a flow. Undo the last edit, or export and fix it by hand.',
  };
}
