import { ExperimentEngine, type AnalyticsCollector } from '@guideflow/analytics'
import type { GuideFlowInstance } from '@guideflow/core'
import { ConversationalPanel, HotspotBeacon, TourStep, useTour, useTourStep } from '@guideflow/react'
import React, { useEffect, useRef, useState } from 'react'

import { conditionalFlow, onboardingFlow } from './flows/onboarding.js'

// ---------------------------------------------------------------------------
// Inline styles (no external CSS dependency for the demo)
// ---------------------------------------------------------------------------
const S = {
  page: { maxWidth: 780, margin: '0 auto', padding: '32px 20px' },
  header: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 },
  h1: { margin: 0, fontSize: 26, fontWeight: 700, color: '#1e293b' },
  badge: (active: boolean): React.CSSProperties => ({
    padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: active ? '#dcfce7' : '#f1f5f9', color: active ? '#15803d' : '#64748b',
  }),
  section: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24, marginBottom: 24 },
  sectionTitle: { margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#0f172a' },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 8 },
  btn: (variant: 'primary' | 'secondary' | 'ghost'): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: variant === 'primary' ? '#6366f1' : variant === 'secondary' ? '#e2e8f0' : 'transparent',
    color: variant === 'primary' ? '#fff' : '#1e293b',
  }),
  log: { background: '#0f172a', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, color: '#94a3b8', maxHeight: 180, overflow: 'auto' },
  logLine: (type: string): React.CSSProperties => ({
    color: type.includes('start') || type.includes('enter') ? '#86efac'
      : type.includes('abandon') || type.includes('skip') ? '#fca5a5'
      : '#93c5fd',
  }),
  pill: (color: string): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
    background: color === 'purple' ? '#ede9fe' : '#dbeafe',
    color: color === 'purple' ? '#7c3aed' : '#1d4ed8',
    fontWeight: 500,
  }),
}

// ---------------------------------------------------------------------------
// App props
// ---------------------------------------------------------------------------
export interface AppProps {
  instance: GuideFlowInstance
  collector: AnalyticsCollector
}

// ---------------------------------------------------------------------------
// A/B Experiment
// ---------------------------------------------------------------------------
const experiment = new ExperimentEngine('demo-user')
const { value: tourTheme } = experiment.assign({
  id: 'tour-cta-label',
  variants: [
    { id: 'control', value: 'Start Onboarding Tour' },
    { id: 'treatment', value: '🚀 Begin Guided Tour' },
  ],
})

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export function App({ instance: gf }: AppProps): React.JSX.Element {
  const { isActive, currentStepIndex, totalSteps, stop } = useTour()
  const { ref: headerRef } = useTourStep<HTMLHeadingElement>('welcome-header')
  const { ref: featuresRef } = useTourStep<HTMLDivElement>('features-section')
  const [showChat, setShowChat] = useState(false)
  const [eventLog, setEventLog] = useState<{ event: string; ts: number }[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  // Subscribe to ALL tour events and feed the visual log
  useEffect(() => {
    const EVENTS = [
      'tour:start', 'tour:complete', 'tour:abandon', 'tour:pause', 'tour:resume',
      'step:enter', 'step:exit', 'step:skip',
      'hotspot:open', 'hotspot:close',
    ] as const
    const cleanups = EVENTS.map((evt) =>
      gf.on(evt, () => setEventLog((prev) => [...prev.slice(-49), { event: evt, ts: Date.now() }]))
    )
    return () => cleanups.forEach((fn) => fn())
  }, [gf])

  // Auto-scroll event log
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [eventLog])

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={S.header} id="demo-header">
        <h1 ref={headerRef} style={S.h1}>GuideFlow Demo</h1>
        <span style={S.badge(isActive)}>
          {isActive ? `Step ${currentStepIndex + 1}/${totalSteps}` : 'No active tour'}
        </span>
      </div>

      {/* ── Tour controls ──────────────────────────────────────────────────── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>Tours</p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
          A/B experiment assigned CTA: <strong>{tourTheme}</strong>{' '}
          <span style={S.pill('purple')}>ExperimentEngine</span>
        </p>
        <div style={S.row}>
          <button style={S.btn('primary')} onClick={() => void gf.start(onboardingFlow)}>
            {tourTheme}
          </button>
          <button style={S.btn('secondary')} onClick={() => void gf.start(conditionalFlow)}>
            Test showIf Skip (conditional flow)
          </button>
          {isActive && (
            <>
              <button style={S.btn('secondary')} onClick={() => void gf.next()}>Next →</button>
              <button style={S.btn('secondary')} onClick={() => void gf.prev()}>← Prev</button>
              <button style={S.btn('ghost')} onClick={() => stop()}>Stop</button>
            </>
          )}
        </div>
        {/* TourStep — renders custom children when step 'welcome-header' is active */}
        <TourStep id="welcome-header">
          {({ next }) => (
            <div style={{ marginTop: 8, padding: '10px 14px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#166534' }}>
              🎉 This is custom <strong>TourStep</strong> content for step <code>welcome-header</code>!
              <button onClick={next} style={{ ...S.btn('primary'), marginLeft: 12, padding: '4px 10px', fontSize: 12 }}>
                Next via TourStep
              </button>
            </div>
          )}
        </TourStep>
      </div>

      {/* ── Features / Hotspots ────────────────────────────────────────────── */}
      <div style={S.section} id="features">
        <p ref={featuresRef} style={S.sectionTitle}>Hotspots <span style={S.pill('blue')}>HotspotBeacon</span></p>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
          Pulsing hotspot beacons are attached to these buttons via <code>&lt;HotspotBeacon&gt;</code>.
          Hover/click them to see the tooltip.
        </p>
        <div style={S.row}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button id="new-feature-btn" style={S.btn('secondary')}>New Feature</button>
            <HotspotBeacon target="#new-feature-btn" title="New!" body="Check out this new feature." color="#6366f1" />
          </div>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button id="beta-btn" style={S.btn('secondary')}>Beta</button>
            <HotspotBeacon target="#beta-btn" title="Beta 🧪" body="This feature is in beta." color="#f59e0b" />
          </div>
        </div>
      </div>

      {/* ── AI Chat ────────────────────────────────────────────────────────── */}
      <div style={S.section}>
        <p style={S.sectionTitle}>AI Chat <span style={S.pill('purple')}>ConversationalPanel</span></p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
          Powered by <code>MockProvider</code>. In production, swap in <code>OpenAIProvider</code>.
        </p>
        <button style={S.btn('primary')} onClick={() => setShowChat((v) => !v)}>
          {showChat ? 'Close Chat' : 'Open AI Help Chat'}
        </button>
        {showChat && (
          <div style={{ marginTop: 12 }}>
            <ConversationalPanel open={showChat} onClose={() => setShowChat(false)} title="GuideFlow AI Help" />
          </div>
        )}
      </div>

      {/* ── Analytics Log ──────────────────────────────────────────────────── */}
      <div style={S.section} id="analytics-log">
        <p style={S.sectionTitle}>Analytics Event Log <span style={S.pill('blue')}>AnalyticsCollector</span></p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
          All tour events are captured here (and logged to the browser console via the console transport).
        </p>
        {eventLog.length === 0 ? (
          <div style={S.log}><p style={{ margin: 0, color: '#475569' }}>Start a tour to see events here…</p></div>
        ) : (
          <div style={S.log}>
            {eventLog.map((e, i) => (
              <div key={i} style={S.logLine(e.event)}>
                <span style={{ color: '#475569', marginRight: 8 }}>{new Date(e.ts).toLocaleTimeString()}</span>
                {e.event}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
        <button style={{ ...S.btn('ghost'), marginTop: 8, fontSize: 11, color: '#94a3b8' }} onClick={() => setEventLog([])}>
          Clear log
        </button>
      </div>
    </div>
  )
}
