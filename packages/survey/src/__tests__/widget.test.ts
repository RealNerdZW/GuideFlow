// ---------------------------------------------------------------------------
// The docked card.
//
// happy-dom has no layout engine, so nothing here asserts geometry — that lives
// in apps/e2e. What is testable is structure, semantics and teardown.
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { createSurveys } from '../controller.js'
import type { SurveyController, SurveyDefinition } from '../types.js'
import { mountSurvey, type SurveyWidget } from '../widget/index.js'

function survey(id: string, extra: Partial<SurveyDefinition> = {}): SurveyDefinition {
  return { id, question: `Question ${id}`, ...extra }
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 5))
}

const root = (): HTMLElement | null => document.querySelector('.gf-survey')
const radios = (): HTMLInputElement[] =>
  [...document.querySelectorAll<HTMLInputElement>('.gf-survey-scale input[type="radio"]')]
const styleTags = (): number => document.querySelectorAll('style[data-gf="gf-survey"]').length

describe('mountSurvey', () => {
  let gf: GuideFlowInstance
  let controller: SurveyController | null = null
  let widget: SurveyWidget | null = null

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    gf = createGuideFlow({ injectStyles: false, context: { userId: 'u1' } })
  })

  afterEach(() => {
    widget?.destroy()
    widget = null
    controller?.destroy()
    controller = null
    gf.destroy()
  })

  it('paints nothing before hydration, then renders the question', async () => {
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    expect(root()).toBeNull()

    await settle()
    expect(root()?.querySelector('.gf-survey-question')?.textContent).toBe('Question a')
  })

  it('is a named landmark, not a dialog', async () => {
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()

    expect(root()?.getAttribute('role')).toBe('region')
    expect(root()?.getAttribute('aria-label')).toBe('Survey')
    expect(root()?.getAttribute('aria-modal')).toBeNull()
  })

  it('renders the scale as a real radiogroup labelled by the question', async () => {
    // Real radios, not buttons: arrow keys move within the group, Tab treats it
    // as one stop, and a screen reader announces "3 of 11". A row of buttons
    // would look identical and lose all three plus the selected state.
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()

    const group = root()?.querySelector('.gf-survey-scale')
    expect(group?.getAttribute('role')).toBe('radiogroup')

    const labelledBy = group?.getAttribute('aria-labelledby')
    expect(labelledBy).toBeTruthy()
    expect(root()?.querySelector(`#${CSS.escape(labelledBy as string)}`)?.textContent).toBe(
      'Question a',
    )

    expect(radios()).toHaveLength(11)
    expect(radios()[0]?.value).toBe('0')
    expect(radios()[10]?.value).toBe('10')
  })

  it('renders the question as text, never as markup', async () => {
    controller = createSurveys(gf, [survey('a', { question: '<img src=x onerror=alert(1)>' })])
    widget = mountSurvey(controller)
    await settle()

    const q = root()?.querySelector('.gf-survey-question')
    expect(q?.querySelector('img')).toBeNull()
    expect(q?.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('choosing a score reveals the follow-up and the submit button', async () => {
    controller = createSurveys(gf, [survey('a', { followUp: { label: 'Why?' } })])
    widget = mountSurvey(controller)
    await settle()

    expect(root()?.querySelector<HTMLElement>('.gf-survey-followup')?.hidden).toBe(true)
    expect(root()?.querySelector<HTMLElement>('.gf-survey-submit')?.hidden).toBe(true)

    const nine = radios()[9]
    if (nine) {
      nine.checked = true
      nine.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await settle()

    expect(root()?.querySelector<HTMLElement>('.gf-survey-followup')?.hidden).toBe(false)
    expect(root()?.querySelector<HTMLElement>('.gf-survey-submit')?.hidden).toBe(false)
    expect(root()?.querySelector('.gf-survey-followup-label')?.textContent).toBe('Why?')
  })

  it('the follow-up label is associated with its textarea', async () => {
    controller = createSurveys(gf, [survey('a', { followUp: { label: 'Why?' } })])
    widget = mountSurvey(controller)
    await settle()
    controller.select(5)
    await settle()

    const label = root()?.querySelector<HTMLLabelElement>('.gf-survey-followup-label')
    const input = root()?.querySelector<HTMLTextAreaElement>('.gf-survey-followup-input')
    expect(label?.htmlFor).toBe(input?.id)
    expect(input?.id).toBeTruthy()
  })

  it('does not rebuild the radios when a score is chosen', async () => {
    // Rebuilding the group would replace the element that has focus and drop
    // focus to <body> mid-interaction.
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()
    const before = radios()[4]

    controller.select(4)
    await settle()

    expect(radios()[4]).toBe(before)
    expect(radios()[4]?.checked).toBe(true)
  })

  it('submitting shows the thanks and hides the question', async () => {
    controller = createSurveys(gf, [survey('a', { thanks: 'Much appreciated.' })])
    widget = mountSurvey(controller)
    await settle()
    controller.select(8)
    await settle()

    root()?.querySelector<HTMLButtonElement>('.gf-survey-submit')?.click()
    await settle()

    expect(root()?.querySelector<HTMLElement>('.gf-survey-thanks')?.hidden).toBe(false)
    expect(root()?.querySelector('.gf-survey-thanks')?.textContent).toBe('Much appreciated.')
    expect(root()?.querySelector<HTMLElement>('.gf-survey-question')?.hidden).toBe(true)
    expect(root()?.querySelector<HTMLElement>('.gf-survey-scale')?.hidden).toBe(true)
  })

  it('carries the typed comment through to the response', async () => {
    const events: unknown[] = []
    controller = createSurveys(gf, [survey('a', { followUp: { label: 'Why?' } })], {
      onEvent: (e) => events.push(e),
    })
    widget = mountSurvey(controller)
    await settle()
    controller.select(2)
    await settle()

    const input = root()?.querySelector<HTMLTextAreaElement>('.gf-survey-followup-input')
    if (input) input.value = 'too slow'
    root()?.querySelector<HTMLButtonElement>('.gf-survey-submit')?.click()
    await settle()

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'response', score: 2, comment: 'too slow' }),
    )
  })

  it('the dismiss button closes it', async () => {
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()

    root()?.querySelector<HTMLButtonElement>('.gf-survey-dismiss')?.click()
    await settle()
    expect(root()).toBeNull()
  })

  it('Escape closes it only when focus is inside', async () => {
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(root()).not.toBeNull()

    root()?.querySelector<HTMLButtonElement>('.gf-survey-dismiss')?.focus()
    root()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(root()).toBeNull()
  })

  it('goes inert while a tour runs', async () => {
    gf.createFlow({
      id: 't',
      initial: 'm',
      states: { m: { steps: [{ id: 's', content: { title: 'S' } }], final: true } },
    })
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()
    expect(root()?.hasAttribute('inert')).toBe(false)

    await gf.start('t')
    await settle()
    expect(root()?.hasAttribute('inert')).toBe(true)
    expect(root()?.hasAttribute('data-gf-tour-active')).toBe(true)
  })

  it('announces the question through its own polite region', async () => {
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    const region = document.querySelector('[role="status"]')
    expect(region).not.toBeNull()
    expect(region).not.toBe(root())
    expect(region?.textContent).toBe('Question a')
  })

  it('announces the thanks when it arrives', async () => {
    controller = createSurveys(gf, [survey('a', { thanks: 'Got it.' })])
    widget = mountSurvey(controller)
    await settle()
    controller.select(6)
    await settle()
    root()?.querySelector<HTMLButtonElement>('.gf-survey-submit')?.click()
    await settle()
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    expect(document.querySelector('[role="status"]')?.textContent).toBe('Got it.')
  })

  it('SSR: mounting without a document is a no-op with a safe destroy', () => {
    const doc = globalThis.document
    const win = globalThis.window
    try {
      // @ts-expect-error deliberately removing the globals
      delete globalThis.document
      // @ts-expect-error deliberately removing the globals
      delete globalThis.window
      const noop = mountSurvey({} as SurveyController)
      expect(() => noop.destroy()).not.toThrow()
    } finally {
      globalThis.document = doc
      globalThis.window = win
    }
  })

  it('a second mount does not lose its styles when the first is destroyed', async () => {
    controller = createSurveys(gf, [survey('a')])
    const first = mountSurvey(controller)
    const second = mountSurvey(controller)
    await settle()
    expect(styleTags()).toBe(1)

    first.destroy()
    expect(styleTags()).toBe(1)

    second.destroy()
    expect(styleTags()).toBe(0)
  })

  it('destroy() removes the card and its live region', async () => {
    controller = createSurveys(gf, [survey('a')])
    widget = mountSurvey(controller)
    await settle()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(document.querySelector('[role="status"]')).not.toBeNull()

    widget.destroy()
    widget = null
    expect(root()).toBeNull()
    expect(document.querySelector('[role="status"]')).toBeNull()
  })
})
