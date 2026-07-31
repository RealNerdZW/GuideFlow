'use client'

// ---------------------------------------------------------------------------
// <ConversationalPanel> — AI-powered chat help panel
// Connects to @guideflow/ai via the GuideFlow instance
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { useGuideFlow } from '../context.js'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  highlights?: string[]
  /** Marks an assistant message produced by a failure rather than the model. */
  error?: boolean
}

export interface ConversationalPanelProps {
  /** Whether the panel is open */
  open?: boolean
  onClose?: () => void
  placeholder?: string
  title?: string
  className?: string
}

/** The slice of `@guideflow/ai`'s GuideBrain this component uses. */
interface AiSurface {
  chat(question: string, root?: Element | null): Promise<{ text: string; highlights?: string[] }>
}

/**
 * AI-powered conversational help panel.
 * Requires @guideflow/ai to be configured on the GuideFlow instance.
 *
 * @example
 * ```tsx
 * <ConversationalPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
 * ```
 */
export function ConversationalPanel({
  open = true,
  onClose,
  placeholder = 'Ask anything about this page...',
  title = 'Need help?',
  className,
}: ConversationalPanelProps): React.JSX.Element | null {
  const gf = useGuideFlow()
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hi! I can help you navigate this page. What would you like to do?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  // Tracks the in-flight request so a second question — or unmounting the panel
  // — discards the answer to the first instead of setting state afterwards.
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => () => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const revealHighlight = useCallback((selector: string): void => {
    if (typeof document === 'undefined') return
    const el = document.querySelector(selector)
    if (!el) {
      console.warn(`[GuideFlow] ConversationalPanel: no element matches "${selector}".`)
      return
    }
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    if (el instanceof HTMLElement) el.focus?.()
  }, [])

  const handleSubmit = useCallback(async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setLoading(true)

    // Abort whatever was still running before starting a new request.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // @guideflow/ai exposes a .ai property on the instance when configured.
    const ai = (gf as unknown as { ai?: AiSurface }).ai
    if (!ai?.chat) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'AI module not configured. Add @guideflow/ai to enable this feature.' },
      ])
      setLoading(false)
      abortRef.current = null
      return
    }

    try {
      const answer = await ai.chat(question)
      // GuideBrain.chat() takes no AbortSignal, so the request itself cannot be
      // cancelled — but a superseded or unmounted panel must not commit its
      // result. See AUDIT `conversationalpanel-no-abort-swallowed-error-dead-highlights`.
      if (controller.signal.aborted) return

      const highlights = answer.highlights ?? []
      setMessages((prev) => [
        ...prev,
        { role: 'assistant' as const, content: answer.text, highlights },
      ])
      const first = highlights[0]
      if (first !== undefined) revealHighlight(first)
    } catch (err) {
      if (controller.signal.aborted) return
      // The error used to be swallowed whole, leaving nothing to debug.
      console.error('[GuideFlow] ConversationalPanel: the AI request failed.', err)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.', error: true },
      ])
    } finally {
      if (!controller.signal.aborted) setLoading(false)
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [gf, input, loading, revealHighlight])

  // Move focus to the question field when the panel opens and hand it back when
  // it closes. A `role="dialog"` that never takes focus is one a keyboard user
  // has to hunt for at the end of the tab order (AUDIT `panel-accessibility`).
  useEffect(() => {
    if (!open) {
      const previous = restoreFocusRef.current
      restoreFocusRef.current = null
      if (previous?.isConnected) previous.focus()
      return
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (active instanceof HTMLElement) restoreFocusRef.current = active
    inputRef.current?.focus()
  }, [open])

  // Escape closes it. Deliberately *not* a focus trap: this panel is
  // non-modal — it sits beside the page and the user is meant to keep using
  // both — so trapping Tab would strand them.
  useEffect(() => {
    if (!open || !onClose) return undefined
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label={title}
      className={`gf-chat-panel${className ? ` ${className}` : ''}`}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 360,
        maxHeight: 520,
        background: 'var(--gf-popover-bg, #fff)',
        color: 'var(--gf-popover-text, #111)',
        borderRadius: 'var(--gf-border-radius, 12px)',
        boxShadow: 'var(--gf-shadow, 0 8px 32px rgba(0,0,0,.16))',
        border: '1px solid var(--gf-popover-border, rgba(0,0,0,.08))',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--gf-font-family, system-ui, sans-serif)',
        zIndex: 1000000,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--gf-popover-border, rgba(0,0,0,.08))', gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{title}</span>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close help panel"
            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 'var(--gf-muted-opacity, .72)', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
            type="button"
          >×</button>
        )}
      </div>

      {/* Messages */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
        role="log"
        aria-live="polite"
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                background: msg.role === 'user' ? 'var(--gf-accent-color, #4f46e5)' : 'rgba(0,0,0,0.05)',
                color: msg.role === 'user' ? 'var(--gf-accent-fg, #fff)' : 'inherit',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              {msg.content}
            </div>
            {msg.highlights && msg.highlights.length > 0 && (
              // The model's suggested selectors used to be stored and never
              // shown. Each is a button that scrolls its element into view.
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {msg.highlights.map((selector) => (
                  <button
                    key={selector}
                    type="button"
                    className="gf-chat-highlight"
                    onClick={() => revealHighlight(selector)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--gf-popover-border, rgba(0,0,0,.15))',
                      borderRadius: 999,
                      padding: '3px 10px',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Show {selector}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div
            role="status"
            style={{ alignSelf: 'flex-start', opacity: 'var(--gf-muted-opacity, .72)', fontSize: 13 }}
          >Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ padding: '12px 16px', borderTop: '1px solid var(--gf-popover-border, rgba(0,0,0,.08))', display: 'flex', gap: 8 }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={loading}
          aria-label="Ask a question"
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid var(--gf-popover-border, rgba(0,0,0,.15))',
            fontSize: 13,
            fontFamily: 'inherit',
            background: 'transparent',
            color: 'inherit',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="gf-btn gf-btn-primary"
          aria-label="Send"
          style={{ padding: '8px 14px', fontSize: 13 }}
        >→</button>
      </form>
    </div>
  )
}
