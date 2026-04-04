// ---------------------------------------------------------------------------
// <ConversationalPanel> — AI-powered chat help panel
// Connects to @guideflow/ai via the GuideFlow instance
// ---------------------------------------------------------------------------

import React, { useState, useRef, useEffect, type FormEvent } from 'react'

import { useGuideFlow } from '../context.js'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  highlights?: string[]
}

export interface ConversationalPanelProps {
  /** Whether the panel is open */
  open?: boolean
  onClose?: () => void
  placeholder?: string
  title?: string
  className?: string
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!open) return null

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      // @guideflow/ai exposes a .ai property on the instance when configured
      const aiProp = (gf as unknown as Record<string, unknown>)['ai'] as
        | { chat: (q: string) => Promise<{ text: string; highlights?: string[] }> }
        | undefined
      if (aiProp?.chat) {
        const answer = await aiProp.chat(question)
        setMessages((prev) => [
          ...prev,
          { role: 'assistant' as const, content: answer.text, highlights: answer.highlights ?? [] },
        ])
        // Spotlight highlighted elements
        if (answer.highlights?.length) {
          answer.highlights.forEach((sel: string) => {
            const el = document.querySelector(sel)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          })
        }
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'AI module not configured. Add @guideflow/ai to enable this feature.' },
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      aria-modal="true"
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
            type="button"
          >×</button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? 'var(--gf-accent-color, #6366f1)' : 'rgba(0,0,0,0.05)',
              color: msg.role === 'user' ? 'var(--gf-accent-fg, #fff)' : 'inherit',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              lineHeight: 1.5,
              maxWidth: '85%',
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', opacity: 0.5, fontSize: 13 }}>Thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{ padding: '12px 16px', borderTop: '1px solid var(--gf-popover-border, rgba(0,0,0,.08))', display: 'flex', gap: 8 }}
      >
        <input
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
            outline: 'none',
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
