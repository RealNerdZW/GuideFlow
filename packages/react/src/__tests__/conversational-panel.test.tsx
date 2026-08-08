// ---------------------------------------------------------------------------
// <ConversationalPanel> — AI chat surface
// ---------------------------------------------------------------------------

import { createGuideFlow, type GuideFlowInstance } from '@guideflow/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConversationalPanel } from '../components/ConversationalPanel.js'
import { TourProvider } from '../context.js'

interface Answer { text: string; highlights?: string[] }
type Chat = (question: string) => Promise<Answer>

let gf: GuideFlowInstance

function attachAi(chat: Chat): void {
  (gf as unknown as { ai: { chat: Chat } }).ai = { chat }
}

/** Run a synchronous interaction, then let its promise chain settle. */
async function settle(fn: () => void): Promise<void> {
  await act(async () => {
    fn()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function mount(open = true): ReturnType<typeof render> {
  return render(
    <TourProvider instance={gf}>
      <ConversationalPanel open={open} />
    </TourProvider>,
  )
}

async function ask(question: string): Promise<void> {
  const input = screen.getByLabelText('Ask a question')
  fireEvent.change(input, { target: { value: question } })
  // happy-dom does not implicitly submit a form when its submit button is
  // clicked, so the submit event is dispatched directly.
  const form = input.closest('form')
  if (!form) throw new Error('no form')
  await settle(() => { fireEvent.submit(form) })
}

/** A promise whose resolution the test controls. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (e: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  gf = createGuideFlow()
})

afterEach(() => {
  cleanup()
  gf.destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ConversationalPanel', () => {
  it('renders nothing when closed', () => {
    mount(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens with a greeting and does not claim to be a modal', () => {
    mount()
    const panel = screen.getByRole('dialog')

    expect(panel.textContent).toContain('Hi! I can help you navigate this page.')
    // It traps nothing and sits alongside the page, so it must not announce
    // itself as modal — that also stops it colliding with the tour dialog.
    expect(panel.getAttribute('aria-modal')).toBeNull()
  })

  it('explains the missing AI module instead of failing silently', async () => {
    mount()
    await ask('how do I export?')

    expect(screen.getByText(/AI module not configured/)).toBeTruthy()
  })

  it('renders the assistant answer', async () => {
    attachAi(() => Promise.resolve({ text: 'Click the export button.' }))
    mount()

    await ask('how do I export?')

    expect(screen.getByText('how do I export?')).toBeTruthy()
    expect(screen.getByText('Click the export button.')).toBeTruthy()
  })

  it('renders the highlights the model returned, and reveals one on click', async () => {
    const anchor = document.createElement('button')
    anchor.id = 'export-btn'
    const scrollIntoView = vi.fn()
    anchor.scrollIntoView = scrollIntoView
    document.body.appendChild(anchor)

    attachAi(() => Promise.resolve({ text: 'Over there.', highlights: ['#export-btn'] }))
    mount()

    await ask('where?')

    // AUDIT `conversationalpanel-no-abort-swallowed-error-dead-highlights`:
    // highlights were stored on the message and never rendered.
    const chip = screen.getByText('Show #export-btn')
    scrollIntoView.mockClear()
    fireEvent.click(chip)

    expect(scrollIntoView).toHaveBeenCalled()
    anchor.remove()
  })

  it('warns when a highlight selector matches nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    attachAi(() => Promise.resolve({ text: 'Over there.', highlights: ['#nope'] }))
    mount()

    await ask('where?')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('#nope'))
  })

  it('logs the real error and shows a recoverable message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const boom = new Error('provider exploded')
    attachAi(() => Promise.reject(boom))
    mount()

    await ask('anything')

    // The error object used to be discarded entirely.
    expect(error).toHaveBeenCalledWith(expect.stringContaining('AI request failed'), boom)
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy()
  })

  it('accepts one question at a time and disables the input while thinking', async () => {
    const pending = deferred<Answer>()
    const chat = vi.fn(() => pending.promise)
    attachAi(chat)
    mount()

    await ask('first question')
    expect(screen.getByLabelText('Ask a question')).toHaveProperty('disabled', true)
    expect(screen.getByText('Thinking…')).toBeTruthy()

    await ask('second question')
    expect(chat).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve({ text: 'ANSWER' })
      await Promise.resolve()
    })
    expect(screen.getByText('ANSWER')).toBeTruthy()
    expect(screen.getByLabelText('Ask a question')).toHaveProperty('disabled', false)
  })

  it('aborts the in-flight request on unmount without touching state', async () => {
    const pending = deferred<Answer>()
    attachAi(() => pending.promise)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = mount()

    await ask('slow question')
    view.unmount()

    await act(async () => {
      pending.resolve({ text: 'TOO LATE' })
      await Promise.resolve()
    })

    expect(document.body.textContent).not.toContain('TOO LATE')
    expect(error).not.toHaveBeenCalled()
  })

  it('ignores a second question typed into the disabled field while thinking', async () => {
    const pending = deferred<Answer>()
    const chat = vi.fn(() => pending.promise)
    attachAi(chat)
    mount()

    await ask('first question')
    expect(chat).toHaveBeenCalledTimes(1)

    // `disabled` is the browser's guard; the `loading` guard in handleSubmit is
    // ours, and it is what stops a scripted or autofilled submit queueing a
    // second request whose answer would land out of order.
    await ask('second question')

    expect(chat).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('second question')).toBeNull()

    await act(async () => {
      pending.resolve({ text: 'ANSWER' })
      await Promise.resolve()
    })
    expect(screen.getByText('ANSWER')).toBeTruthy()
  })

  it('discards a failed request that lands after the panel is gone', async () => {
    const pending = deferred<Answer>()
    attachAi(() => pending.promise)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = mount()

    await ask('slow question')
    view.unmount()

    await act(async () => {
      pending.reject(new Error('provider exploded'))
      await Promise.resolve()
    })

    // The rejection arrives on an unmounted panel: nothing to log, nothing to
    // render, and no setState on a dead component.
    expect(error).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('Something went wrong')
  })

  it('appends the className to the panel', () => {
    render(
      <TourProvider instance={gf}>
        <ConversationalPanel open className="tenant-theme" />
      </TourProvider>,
    )

    expect(screen.getByRole('dialog').className).toBe('gf-chat-panel tenant-theme')
  })

  it('ignores an empty question', async () => {
    const chat = vi.fn(() => Promise.resolve({ text: 'nope' }))
    attachAi(chat)
    mount()

    await settle(() => { fireEvent.submit(screen.getByLabelText('Ask a question').closest('form')!) })

    expect(chat).not.toHaveBeenCalled()
  })
})
