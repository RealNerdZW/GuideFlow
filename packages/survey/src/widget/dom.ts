// ---------------------------------------------------------------------------
// The DOM. Built once, patched in place.
//
// Every text value goes in through `textContent`; nothing here touches
// innerHTML, which is why this package needs no escaping helper and no
// sanitiser. `SurveyDefinition.question` is documented as plain text for
// exactly that reason.
// ---------------------------------------------------------------------------

import type { SurveyView } from '../types.js'

export interface SurveyStrings {
  /** Accessible name for the landmark. A region with none is not exposed. */
  region: string
  dismiss: string
  submit: string
}

export const DEFAULT_STRINGS: SurveyStrings = {
  region: 'Survey',
  dismiss: 'Close',
  submit: 'Submit',
}

let counter = 0
export function nextId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}

export interface SurveyElements {
  root: HTMLElement
  question: HTMLElement
  scale: HTMLElement
  minLabel: HTMLElement
  maxLabel: HTMLElement
  followUp: HTMLElement
  followUpLabel: HTMLLabelElement
  followUpInput: HTMLTextAreaElement
  submit: HTMLButtonElement
  thanks: HTMLElement
  dismiss: HTMLButtonElement
}

/**
 * The skeleton.
 *
 * `role="region"` — a landmark, so the card is findable after it appears and
 * escapable once found. Not `role="dialog"`: this does not demand an answer and
 * must not trap focus (WCAG 2.1.2). Not `role="alert"`: assertive, and it would
 * cut a running tour's step announcement in half.
 *
 * The scale is a real `radiogroup` of real `<input type="radio">`, which buys
 * the correct keyboard model for free — arrow keys move within the group, Tab
 * enters and leaves it as one stop, and a screen reader announces "3 of 11".
 * A row of `<button>`s would look identical and lose all three, plus the
 * selected state.
 */
export function buildSkeleton(strings: SurveyStrings): SurveyElements {
  const groupId = nextId('gf-survey-q')

  const root = document.createElement('section')
  root.className = 'gf-survey'
  root.setAttribute('role', 'region')
  root.setAttribute('aria-label', strings.region)

  const question = document.createElement('p')
  question.className = 'gf-survey-question'
  question.id = groupId

  const scale = document.createElement('div')
  scale.className = 'gf-survey-scale'
  scale.setAttribute('role', 'radiogroup')
  // The group is named by the question itself, so the first radio announces
  // the whole question rather than a bare number.
  scale.setAttribute('aria-labelledby', groupId)

  const minLabel = document.createElement('span')
  minLabel.className = 'gf-survey-min'
  const maxLabel = document.createElement('span')
  maxLabel.className = 'gf-survey-max'

  const ends = document.createElement('div')
  ends.className = 'gf-survey-ends'
  ends.append(minLabel, maxLabel)

  const followUpLabel = document.createElement('label')
  followUpLabel.className = 'gf-survey-followup-label'
  const followUpInput = document.createElement('textarea')
  followUpInput.className = 'gf-survey-followup-input'
  followUpInput.id = nextId('gf-survey-comment')
  followUpInput.rows = 2
  followUpLabel.htmlFor = followUpInput.id

  const followUp = document.createElement('div')
  followUp.className = 'gf-survey-followup'
  followUp.append(followUpLabel, followUpInput)

  const submit = document.createElement('button')
  submit.type = 'button'
  submit.className = 'gf-survey-submit'
  submit.textContent = strings.submit

  const thanks = document.createElement('p')
  thanks.className = 'gf-survey-thanks'

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.className = 'gf-survey-dismiss'
  dismiss.setAttribute('aria-label', strings.dismiss)
  dismiss.textContent = '×'

  const body = document.createElement('div')
  body.className = 'gf-survey-body'
  body.append(question, scale, ends, followUp, submit, thanks)

  root.append(body, dismiss)
  return {
    root,
    question,
    scale,
    minLabel,
    maxLabel,
    followUp,
    followUpLabel,
    followUpInput,
    submit,
    thanks,
    dismiss,
  }
}

/**
 * Patch the card to match `view`.
 *
 * The radios are built once per question and then only have `checked` toggled,
 * so choosing a score never replaces the element that has focus — rebuilding
 * the group on every selection would drop focus to `<body>` mid-interaction.
 */
export function updateSurvey(
  els: SurveyElements,
  view: SurveyView,
  strings: SurveyStrings,
  onSelect: (score: number) => void,
): void {
  els.root.setAttribute('data-gf-phase', view.phase)
  els.question.textContent = view.question
  els.dismiss.hidden = !view.dismissible
  els.dismiss.setAttribute('aria-label', strings.dismiss)

  const thanking = view.phase === 'thanks'
  els.thanks.textContent = thanking ? view.thanks : ''
  els.thanks.hidden = !thanking
  els.question.hidden = thanking
  els.scale.hidden = thanking

  if (thanking) {
    els.followUp.hidden = true
    els.submit.hidden = true
    return
  }

  const groupName = `gf-survey-${view.id}`
  const existing = els.scale.querySelectorAll<HTMLInputElement>('input[type="radio"]')
  if (existing.length !== view.values.length || existing[0]?.name !== groupName) {
    els.scale.replaceChildren()
    for (const value of view.values) {
      const label = document.createElement('label')
      label.className = 'gf-survey-value'

      const input = document.createElement('input')
      input.type = 'radio'
      input.name = groupName
      input.value = String(value)
      input.addEventListener('change', () => { onSelect(value) })

      const text = document.createElement('span')
      text.textContent = String(value)

      label.append(input, text)
      els.scale.appendChild(label)
    }
  }

  for (const input of els.scale.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    input.checked = Number(input.value) === view.score
  }

  els.minLabel.textContent = view.minLabel ?? ''
  els.maxLabel.textContent = view.maxLabel ?? ''

  const showFollowUp = view.followUp !== undefined
  els.followUp.hidden = !showFollowUp
  if (view.followUp) {
    els.followUpLabel.textContent = view.followUp.label
    els.followUpInput.placeholder = view.followUp.placeholder ?? ''
  }

  // Submit appears with the score, not before: a submit button that does
  // nothing is a control that has to be explained.
  els.submit.hidden = view.score === null
  els.submit.textContent = strings.submit
}
