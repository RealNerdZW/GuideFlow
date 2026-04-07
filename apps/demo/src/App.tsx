import type { GuideBrain } from '@guideflow/ai'
import { ExperimentEngine, type AnalyticsCollector, type AnalyticsEvent } from '@guideflow/analytics'
import type { FlowDefinition, FlowSnapshot, GuideFlowInstance, HintStep, Step } from '@guideflow/core'
import { watchAttributeTour } from '@guideflow/core'
import {
  ConversationalPanel,
  HotspotBeacon,
  TourStep,
  useTour,
  useTourStep,
} from '@guideflow/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import {
  conditionalFlow,
  customActionsFlow,
  type DemoContext,
  fsmBranchFlow,
  onboardingFlow,
} from './flows/onboarding.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type AugmentedGF = GuideFlowInstance & { ai?: GuideBrain }

/** Mirrors PushOptions from @guideflow/cli (which ships no .d.ts currently). */
interface PushOptions {
  endpoint: string
  apiKey?: string
  env?: string
}

export interface AppProps {
  instance: AugmentedGF
  collector: AnalyticsCollector
  capturedEvents: AnalyticsEvent[]
}

// ---------------------------------------------------------------------------
// Inline design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#0f172a', muted: '#64748b', subtle: '#94a3b8',
  primary: '#6366f1', success: '#22c55e', warn: '#f59e0b', danger: '#ef4444',
  codeBlk: '#0f172a',
}
const S = {
  page:    { display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14, color: C.text },
  sidebar: { width: 200, flexShrink: 0, background: '#1e293b', padding: '20px 0', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  navTitle:{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '0 16px 8px', textTransform: 'uppercase' },
  navItem: { display: 'block', padding: '7px 16px', color: '#cbd5e1', fontSize: 13, textDecoration: 'none', borderRadius: 0, cursor: 'pointer', background: 'transparent', border: 'none', width: '100%', textAlign: 'left' },
  main:    { flex: 1, padding: '32px 28px', maxWidth: 860 },
  card:    { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 20 },
  cardTitle:{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 8 },
  row:     { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  code:    { background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12, color: '#7c3aed' },
  log:     { background: C.codeBlk, borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', maxHeight: 160, overflowY: 'auto' },
  input:   { padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, flex: 1, outline: 'none' },
  label:   { fontSize: 12, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 4 },
  hr:      { border: 'none', borderTop: `1px solid ${C.border}`, margin: '16px 0' },
} as const satisfies Record<string, React.CSSProperties>

const btn = (variant: 'primary'|'secondary'|'ghost'|'danger', extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  background: variant === 'primary' ? C.primary
    : variant === 'danger' ? C.danger
    : variant === 'secondary' ? C.border
    : 'transparent',
  color: variant === 'primary' || variant === 'danger' ? '#fff' : C.text,
  ...extra,
})

const badge = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 20,
  fontSize: 11, fontWeight: 600,
  background: color === 'green' ? '#dcfce7' : color === 'blue' ? '#dbeafe' : color === 'purple' ? '#ede9fe' : color === 'amber' ? '#fef3c7' : '#f1f5f9',
  color: color === 'green' ? '#15803d' : color === 'blue' ? '#1d4ed8' : color === 'purple' ? '#7c3aed' : color === 'amber' ? '#92400e' : C.muted,
})

// ---------------------------------------------------------------------------
// A/B Experiments (module-level — same user always gets same variant)
// ---------------------------------------------------------------------------
const expEngine = new ExperimentEngine('demo-user')
const tourCtaExp = expEngine.assign({
  id: 'tour-cta-label',
  variants: [
    { id: 'control',   value: 'Start Onboarding Tour' },
    { id: 'treatment', value: '🚀 Begin Guided Tour', weight: 2 },
  ],
})
const themeExp = expEngine.assign({
  id: 'card-theme',
  variants: [
    { id: 'light', value: 'Light Theme' },
    { id: 'dark',  value: 'Dark Theme' },
  ],
})
const cacheExp = expEngine.assign({
  id: 'hint-icon',
  variants: [
    { id: 'emoji', value: '💡' },
    { id: 'text',  value: '?' },
    { id: 'dot',   value: '\u25CF', weight: 3 },
  ],
})

// ---------------------------------------------------------------------------
// Hints definition (registered once outside the component for stability)
// ---------------------------------------------------------------------------
const HINTS: HintStep[] = [
  { id: 'hint-tours',  target: '#gf-tours',     hint: 'Launch tours from here',      icon: cacheExp.value },
  { id: 'hint-hot',    target: '#gf-hotspots',  hint: 'Hotspot beacons section',     icon: cacheExp.value },
  { id: 'hint-ai',     target: '#gf-ai',        hint: 'AI feature demo',             icon: cacheExp.value },
  { id: 'hint-ab',     target: '#gf-analytics', hint: 'Analytics + A/B testing',     icon: cacheExp.value },
]

// ---------------------------------------------------------------------------
// Flow map for the CLI exporter (module-level for stable reference)
// ---------------------------------------------------------------------------
const FLOW_MAP = { onboardingFlow, fsmBranchFlow, conditionalFlow, customActionsFlow }

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export function App({ instance: gf, collector: _collector, capturedEvents }: AppProps): React.JSX.Element {
  const { isActive, currentStepIndex, totalSteps, next, prev, stop } = useTour()
  const { ref: headerRef }   = useTourStep<HTMLHeadingElement>('welcome-header')
  const { ref: toursRef }    = useTourStep<HTMLDivElement>('tours-section')
  const { ref: hotspotRef }  = useTourStep<HTMLDivElement>('hotspots-section')
  const { ref: aiRef }       = useTourStep<HTMLDivElement>('ai-section')
  const { ref: analyticsRef }= useTourStep<HTMLDivElement>('analytics-section')

  // ── Tour state ─────────────────────────────────────────────────────────
  const [fsmRole, setFsmRole]     = useState<DemoContext['role']>('user')
  const [eventLog, setEventLog]   = useState<{ evt: string; ts: number }[]>([])
  const logEndRef                 = useRef<HTMLDivElement>(null)

  // ── Programmatic hotspots ───────────────────────────────────────────────
  const [progHotspotId, setProgHotspotId] = useState<string | null>(null)

  // ── Hints ───────────────────────────────────────────────────────────────
  const [hintsRegistered, setHintsRegistered] = useState(false)

  // ── AI ──────────────────────────────────────────────────────────────────
  const [showChat, setShowChat]       = useState(false)
  const [chatInput, setChatInput]     = useState('')
  const [chatReply, setChatReply]     = useState('')
  const [genPrompt, setGenPrompt]     = useState('Walk me through the main features')
  const [genSteps, setGenSteps]       = useState<Step[] | null>(null)
  const [aiLoading, setAiLoading]     = useState(false)

  // ── i18n ────────────────────────────────────────────────────────────────
  const [locale, setLocale]           = useState('en')

  // ── Persistence ─────────────────────────────────────────────────────────
  const [snapshot, setSnapshot]       = useState<FlowSnapshot | null>(null)
  const [persistLog, setPersistLog]   = useState<string[]>([])

  // ── Config ──────────────────────────────────────────────────────────────
  const [debugOn, setDebugOn]         = useState(true)
  const [attrWatcher, setAttrWatcher] = useState<(() => void) | null>(null)

  // ── Analytics ticker ────────────────────────────────────────────────────
  const [, forceUpdate]               = useState(0)
  // ── DevTools detection ─────────────────────────────────────────────
  type WinExt = Window & { __guideflow?: unknown; __GUIDEFLOW_DEVTOOLS__?: boolean }
  const [extDetected, setExtDetected]     = useState<boolean | null>(null)
  const [studioActive, setStudioActive]   = useState(false)

  // ── CLI / Flow exporter ────────────────────────────────────────────
  const [exportFlowKey, setExportFlowKey] = useState('onboardingFlow')
  const [exportedJson, setExportedJson]   = useState<string | null>(null)
  const [copied, setCopied]               = useState(false)
  const [pushConfig, setPushConfig]       = useState<PushOptions>({
    endpoint: 'https://api.guideflow.dev/v1/flows',
    apiKey: '',
  })
  // ── Subscribe tour events for live log ───────────────────────────────
  useEffect(() => {
    const EVTS = [
      'tour:start','tour:complete','tour:abandon','tour:pause','tour:resume',
      'step:enter','step:exit','step:skip',
      'hotspot:open','hotspot:close','hint:click',
    ] as const
    const drops = EVTS.map((e) =>
      gf.on(e, () => setEventLog((p) => [...p.slice(-79), { evt: e, ts: Date.now() }]))
    )
    return () => drops.forEach((d) => d())
  }, [gf])

  // ── Auto-scroll log ───────────────────────────────────────────────────
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [eventLog])

  // ── Tick analytics panel so capturedEvents shows live ────────────────
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1500)
    return () => clearInterval(id)
  }, [])
  // ── Poll for devtools extension + guideflow studio ──────────────────────────
  useEffect(() => {
    const check = () => {
      const w = window as WinExt
      setExtDetected(typeof w.__guideflow !== 'undefined')
      setStudioActive(w.__GUIDEFLOW_DEVTOOLS__ === true)
    }
    check()
    const id = setInterval(check, 2000)
    return () => clearInterval(id)
  }, [])
  // ── i18n switching ────────────────────────────────────────────────────
  useEffect(() => { gf.i18n.use(locale) }, [gf, locale])

  // ── Helpers ───────────────────────────────────────────────────────────
  const startFsmBranch = useCallback(() => {
    void gf.start(
      fsmBranchFlow as unknown as FlowDefinition,
      { role: fsmRole, completedSetup: false } as unknown as Parameters<typeof gf.start>[1],
    )
  }, [gf, fsmRole])

  const addProgHotspot = useCallback(() => {
    if (progHotspotId) { gf.removeHotspot(progHotspotId); setProgHotspotId(null); return }
    const id = gf.hotspot('#gf-prog-btn', {
      title: 'Programmatic!',
      body: 'Added via gf.hotspot(target, options) — no component needed.',
      color: '#6366f1',
      placement: 'top',
    })
    setProgHotspotId(id)
  }, [gf, progHotspotId])

  const registerHints = useCallback(() => {
    gf.hints(HINTS)
    setHintsRegistered(true)
  }, [gf])

  const aiChat = useCallback(async () => {
    if (!gf.ai || !chatInput.trim()) return
    setAiLoading(true)
    try {
      const answer = await gf.ai.chat(chatInput)
      setChatReply(answer.text)
    } finally {
      setAiLoading(false)
    }
  }, [gf, chatInput])

  const aiGenerate = useCallback(async () => {
    if (!gf.ai) return
    setAiLoading(true)
    try {
      const steps = await gf.ai.generate(genPrompt)
      setGenSteps(steps)
    } finally {
      setAiLoading(false)
    }
  }, [gf, genPrompt])

  const saveSnap = useCallback(async () => {
    const snap = await gf.progress.loadSnapshot('demo-user', 'demo-onboarding')
    setSnapshot(snap)
    setPersistLog((p) => [...p, snap ? `Loaded snapshot: state=${snap.currentState}` : 'No snapshot found'])
  }, [gf])

  const markComplete = useCallback(async () => {
    await gf.progress.markCompleted('demo-user', 'demo-onboarding')
    setPersistLog((p) => [...p, 'Marked demo-onboarding as completed'])
  }, [gf])

  const dismissFlow = useCallback(async () => {
    await gf.progress.markDismissed('demo-user', 'demo-onboarding')
    setPersistLog((p) => [...p, 'Dismissed demo-onboarding'])
  }, [gf])

  const resetProgress = useCallback(async () => {
    await gf.progress.resetUser('demo-user')
    setSnapshot(null)
    setPersistLog((p) => [...p, 'Reset all progress for demo-user'])
  }, [gf])

  const toggleDebug = useCallback(() => {
    const next = !debugOn
    setDebugOn(next)
    gf.configure({ debug: next })
  }, [gf, debugOn])

  const toggleAttrWatch = useCallback(() => {
    if (attrWatcher) { attrWatcher(); setAttrWatcher(null); return }
    const stop = watchAttributeTour((flow) => {
      // Guard: don't restart a tour if one is already active
      if (!gf.isActive) void gf.start(flow)
    })
    setAttrWatcher(() => stop)
  }, [gf, attrWatcher])

  // ── CLI: flow exporter ───────────────────────────────────────────────────
  const exportFlowJSON = useCallback(() => {
    const flow = FLOW_MAP[exportFlowKey as keyof typeof FLOW_MAP]
    const replacer = (_k: string, v: unknown) => typeof v === 'function' ? '[Function]' : v
    setExportedJson(JSON.stringify(flow, replacer, 2))
  }, [exportFlowKey])

  const copyJSON = useCallback(() => {
    if (!exportedJson) return
    void navigator.clipboard.writeText(exportedJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [exportedJson])

  const localeStrings = gf.i18n.getLocale(locale)

  // ── Event log color ────────────────────────────────────────────────────
  const logColor = (e: string) =>
    e.includes('start') || e.includes('enter') ? '#86efac'
    : e.includes('abandon') || e.includes('skip') ? '#fca5a5'
    : e.includes('complete') ? '#67e8f9'
    : '#93c5fd'

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <nav style={S.sidebar}>
        <div style={S.navTitle}>GuideFlow</div>
        {([
          ['#gf-header',      '🏠 Overview'],
          ['#gf-tours',       '🎯 Tours & FSM'],
          ['#gf-hotspots',    '📍 Hotspots & Hints'],
          ['#gf-ai',          '🤖 AI Features'],
          ['#gf-ab',          '🧪 A/B Testing'],
          ['#gf-i18n',        '🌍 i18n'],
          ['#gf-persistence', '💾 Persistence'],
          ['#gf-config',      '\u2699\uFE0F Config'],
          ['#gf-devtools',    '🛠 DevTools'],
          ['#gf-cli',         '⌨️ CLI'],
          ['#gf-analytics',   '📊 Analytics'],
        ] as [string, string][]).map(([href, label]) => (
          <a key={href} href={href} style={S.navItem}>{label}</a>
        ))}
        <div style={{ ...S.navTitle, marginTop: 20 }}>Live State</div>
        <div style={{ padding: '4px 16px', fontSize: 12, color: isActive ? '#86efac' : '#64748b' }}>
          {isActive ? `\u25CF Step ${currentStepIndex + 1}/${totalSteps}` : '\u25CB Idle'}
        </div>
      </nav>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main style={S.main}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div id="gf-header" style={{ marginBottom: 24 }}>
          <h1 ref={headerRef} style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800, color: C.text }}>
            GuideFlow Demo
          </h1>
          <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>
            Comprehensive showcase of <code style={S.code}>@guideflow/core</code>,{' '}
            <code style={S.code}>@guideflow/react</code>,{' '}
            <code style={S.code}>@guideflow/ai</code> and{' '}
            <code style={S.code}>@guideflow/analytics</code>
          </p>
          {isActive && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={badge('green')}>{`Step ${currentStepIndex + 1} / ${totalSteps}`}</span>
              <button style={btn('secondary')} onClick={() => void prev()}>← Prev</button>
              <button style={btn('secondary')} onClick={() => void next()}>Next →</button>
              <button style={btn('ghost')} onClick={() => stop()}>Stop</button>
            </div>
          )}
        </div>

        {/* ── Tours & FSM ───────────────────────────────────────────────── */}
        <section id="gf-tours" style={S.card}>
          <h2 ref={toursRef} style={S.cardTitle}>
            🎯 Tours & State Machine
            <span style={badge('purple')}>FlowDefinition</span>
          </h2>

          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 13 }}>
            A/B variant: <strong>{tourCtaExp.value}</strong>{' '}
            <span style={badge('blue')}>ExperimentEngine</span>
          </p>

          {/* Launch buttons */}
          <div style={S.row}>
            <button style={btn('primary')} onClick={() => void gf.start(onboardingFlow)}>
              {tourCtaExp.value}
            </button>
            <button style={btn('secondary')} onClick={startFsmBranch}>
              🔀 FSM Branch ({fsmRole})
            </button>
            <button style={btn('secondary')} onClick={() => void gf.start(conditionalFlow)}>
              showIf Skip Test
            </button>
            <button style={btn('secondary')} onClick={() => void gf.start(customActionsFlow)}>
              🎮 Custom Actions
            </button>
          </div>

          {/* Role selector for FSM demo */}
          <div style={{ ...S.row, marginBottom: 12 }}>
            <span style={S.label}>FSM role for guard demo:</span>
            {(['admin', 'user'] as const).map((r) => (
              <button
                key={r}
                style={btn(fsmRole === r ? 'primary' : 'secondary', { padding: '4px 10px', fontSize: 12 })}
                onClick={() => setFsmRole(r)}
              >{r}</button>
            ))}
          </div>

          <hr style={S.hr} />

          {/* TourStep — declarative step content (renders when step id is active) */}
          <TourStep id="welcome-header">
            {({ next: n }) => (
              <div style={{ padding: '10px 14px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#166534', marginBottom: 10 }}>
                🎉 <strong>TourStep</strong> render prop is active for step{' '}
                <code style={S.code}>welcome-header</code>!
                <button onClick={n} style={{ ...btn('primary'), marginLeft: 12, padding: '3px 10px', fontSize: 11 }}>
                  Next via TourStep
                </button>
              </div>
            )}
          </TourStep>

          {/* GoTo & Send */}
          {isActive && (
            <div style={S.row}>
              <button style={btn('ghost', { fontSize: 12 })} onClick={() => void gf.goTo('analytics-section')}>
                goTo analytics-section
              </button>
              <button style={btn('ghost', { fontSize: 12 })} onClick={() => void gf.send('NEXT')}>
                send NEXT event
              </button>
            </div>
          )}

          {/* listFlows */}
          <div style={{ marginTop: 8, fontSize: 12, color: C.subtle }}>
            Registered flows: {gf.listFlows().length === 0 ? 'none (inline flows not registered via createFlow)' : gf.listFlows().map((f) => f.id).join(', ')}
          </div>
        </section>

        {/* ── Hotspots & Hints ─────────────────────────────────────────── */}
        <section id="gf-hotspots" style={S.card}>
          <h2 ref={hotspotRef} style={S.cardTitle}>
            📍 Hotspots & Hints
            <span style={badge('blue')}>HotspotBeacon</span>
            <span style={badge('amber')}>gf.hints()</span>
          </h2>

          {/* Declarative HotspotBeacon */}
          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 13 }}>
            Declarative beacons via <code style={S.code}>&lt;HotspotBeacon&gt;</code>:
          </p>
          <div style={S.row}>
            {([
              ['#hspot-new',  '#6366f1', 'New Feature',  'Try this new capability!'],
              ['#hspot-beta', '#f59e0b', 'Beta 🧪',    'This feature is in beta.'],
              ['#hspot-exp',  '#22c55e', 'Stable \u2713',     'Fully stable, go for it!'],
            ] as [string, string, string, string][]).map(([id, color, label, body]) => (
              <div key={id} style={{ position: 'relative', display: 'inline-block' }}>
                <button id={id.slice(1)} style={btn('secondary')}>{label}</button>
                <HotspotBeacon target={id} title={label} body={body} color={color} />
              </div>
            ))}
          </div>

          <hr style={S.hr} />

          {/* Programmatic hotspot */}
          <p style={{ margin: '0 0 8px', color: C.muted, fontSize: 13 }}>
            Programmatic via <code style={S.code}>gf.hotspot(target, options)</code>:
          </p>
          <div style={S.row}>
            <button id="gf-prog-btn" style={btn('secondary')}>Target Element</button>
            <button style={btn(progHotspotId ? 'danger' : 'primary')} onClick={addProgHotspot}>
              {progHotspotId ? 'Remove Hotspot' : 'Add Hotspot'}
            </button>
          </div>

          <hr style={S.hr} />

          {/* Hints */}
          <p style={{ margin: '0 0 8px', color: C.muted, fontSize: 13 }}>
            Hint badges via <code style={S.code}>gf.hints(steps)</code> — numbered overlays on elements:
          </p>
          <div style={S.row}>
            <button style={btn('secondary')} onClick={registerHints} disabled={hintsRegistered}>
              {hintsRegistered ? 'Hints Registered \u2713' : 'Register Hints'}
            </button>
            <button style={btn('secondary')} onClick={() => gf.showHints()} disabled={!hintsRegistered}>Show Hints</button>
            <button style={btn('secondary')} onClick={() => gf.hideHints()} disabled={!hintsRegistered}>Hide Hints</button>
          </div>
          {hintsRegistered && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.subtle }}>
              Hint icon variant assigned by ExperimentEngine: <strong>{cacheExp.value}</strong>
            </p>
          )}
        </section>

        {/* ── AI Features ───────────────────────────────────────────────── */}
        <section id="gf-ai" style={S.card}>
          <h2 ref={aiRef} style={S.cardTitle}>
            🤖 AI Features
            <span style={badge('purple')}>@guideflow/ai</span>
          </h2>

          {/* ai.generate */}
          <p style={S.label}>ai.generate(prompt) — build a tour from the live DOM</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={S.input}
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="Describe the tour you want…"
            />
            <button style={btn('primary')} onClick={() => void aiGenerate()} disabled={aiLoading}>
              {aiLoading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {genSteps && (
            <div style={S.log}>
              {genSteps.map((s, i) => (
                <div key={i} style={{ color: '#86efac' }}>{i + 1}. [{s.id}] {typeof s.content === 'object' ? s.content.title : '…'}</div>
              ))}
            </div>
          )}

          <hr style={S.hr} />

          {/* ai.chat */}
          <p style={S.label}>ai.chat(question) — answer user questions about this page</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: chatReply ? 8 : 0 }}>
            <input
              style={S.input}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void aiChat()}
              placeholder="Ask anything about this page…"
            />
            <button style={btn('primary')} onClick={() => void aiChat()} disabled={aiLoading || !chatInput.trim()}>
              {aiLoading ? '…' : 'Ask'}
            </button>
          </div>
          {chatReply && (
            <div style={{ ...S.log, color: '#93c5fd', marginTop: 4 }}>{chatReply}</div>
          )}

          <hr style={S.hr} />

          {/* ConversationalPanel */}
          <p style={S.label}>ConversationalPanel — full chat UI component</p>
          <button style={btn('primary')} onClick={() => setShowChat((v) => !v)}>
            {showChat ? 'Close Panel' : 'Open ConversationalPanel'}
          </button>
          {showChat && (
            <div style={{ marginTop: 12 }}>
              <ConversationalPanel
                open={showChat}
                onClose={() => setShowChat(false)}
                title="GuideFlow AI Help"
              />
            </div>
          )}
        </section>

        {/* ── A/B Testing ───────────────────────────────────────────────── */}
        <section id="gf-ab" style={S.card}>
          <h2 style={S.cardTitle}>
            🧪 A/B Experiments
            <span style={badge('blue')}>ExperimentEngine</span>
          </h2>
          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 13 }}>
            Deterministic djb2-based assignment — same user always gets the same variant.
          </p>
          {([
            ['tour-cta-label', tourCtaExp],
            ['card-theme',     themeExp],
            ['hint-icon',      cacheExp],
          ] as [string, typeof tourCtaExp][]).map(([id, result]) => (
            <div key={id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={S.label as React.CSSProperties}>{id}</span>
                <span style={badge('purple')}>variant: {result.variantId}</span>
              </div>
              <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: C.primary,
                  width: result.variantId === 'control' ? '33%' : result.variantId === 'treatment' ? '66%' : '50%',
                  transition: 'width 0.4s',
                }} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Assigned value: <code style={S.code}>{String(result.value)}</code>
              </div>
            </div>
          ))}
        </section>

        {/* ── i18n ──────────────────────────────────────────────────────── */}
        <section id="gf-i18n" style={S.card}>
          <h2 style={S.cardTitle}>
            🌍 Internationalization
            <span style={badge('green')}>I18nRegistry</span>
          </h2>
          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 13 }}>
            Registered locales: <code style={S.code}>en, fr, es, zh</code>.
            Active: <code style={S.code}>{locale}</code>
          </p>
          <div style={{ ...S.row, marginBottom: 16 }}>
            {(['en','fr','es','zh'] as const).map((l) => (
              <button key={l} style={btn(locale === l ? 'primary' : 'secondary', { padding: '5px 12px' })} onClick={() => setLocale(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 20px', fontSize: 13 }}>
            {(Object.entries(localeStrings) as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 8 }}>
                <span style={{ color: C.muted, minWidth: 80 }}>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* ── Persistence ───────────────────────────────────────────────── */}
        <section id="gf-persistence" style={S.card}>
          <h2 style={S.cardTitle}>
            💾 Persistence
            <span style={badge('amber')}>ProgressStore</span>
          </h2>
          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 13 }}>
            Uses <code style={S.code}>LocalStorageDriver</code>.
            Ops: <code style={S.code}>loadSnapshot</code>, <code style={S.code}>markCompleted</code>,{' '}
            <code style={S.code}>markDismissed</code>, <code style={S.code}>resetUser</code>.
          </p>
          <div style={S.row}>
            <button style={btn('secondary')} onClick={() => void saveSnap()}>Load Snapshot</button>
            <button style={btn('secondary')} onClick={() => void markComplete()}>Mark Completed</button>
            <button style={btn('secondary')} onClick={() => void dismissFlow()}>Dismiss Flow</button>
            <button style={btn('danger')} onClick={() => void resetProgress()}>Reset All</button>
          </div>
          {snapshot && (
            <div style={{ ...S.log, marginTop: 10 }}>
              <div style={{ color: '#86efac' }}>flowId: {snapshot.flowId}</div>
              <div>state: {snapshot.currentState} | stepIndex: {snapshot.stepIndex} | completed: {String(snapshot.completed)}</div>
              <div style={{ color: C.subtle }}>ts: {new Date(snapshot.timestamp).toLocaleString()}</div>
            </div>
          )}
          {persistLog.length > 0 && (
            <div style={{ ...S.log, marginTop: 8 }}>
              {persistLog.slice(-6).map((l, i) => <div key={i} style={{ color: '#93c5fd' }}>{l}</div>)}
            </div>
          )}
        </section>

        {/* ── Config ────────────────────────────────────────────────────── */}
        <section id="gf-config" style={S.card}>
          <h2 style={S.cardTitle}>
            \u2699\uFE0F Runtime Config
            <span style={badge('blue')}>gf.configure()</span>
          </h2>
          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 13 }}>
            <code style={S.code}>gf.configure(patch)</code> updates options at any time.
          </p>
          <div style={S.row}>
            <button style={btn(debugOn ? 'primary' : 'secondary')} onClick={toggleDebug}>
              Debug: {debugOn ? 'ON' : 'OFF'}
            </button>
            <button style={btn(attrWatcher ? 'primary' : 'secondary')} onClick={toggleAttrWatch}>
              watchAttributeTour: {attrWatcher ? 'Watching' : 'Off'}
            </button>
          </div>
          {attrWatcher && (
            <div style={{ marginTop: 10, padding: 12, background: '#f0fdf4', borderRadius: 6, fontSize: 12 }}>
              <strong>watchAttributeTour is active.</strong> Add{' '}
              <code style={S.code}>data-gf-title="My Step"</code> and{' '}
              <code style={S.code}>data-gf-body="Step body"</code> attributes to any element —
              the observer will pick them up and auto-start a tour.
              <div style={{ marginTop: 8 }}>
                <span
                  data-gf-step="attr-demo"
                  data-gf-title="Attribute Tour Step"
                  data-gf-body="This step was discovered via data-gf-* attributes — no JS needed"
                  style={{ padding: '4px 10px', background: '#dcfce7', borderRadius: 4, cursor: 'default', userSelect: 'none' }}
                >
                  📦 data-gf-* target element
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── DevTools ──────────────────────────────────────────────────── */}
        <section id="gf-devtools" style={S.card}>
          <h2 style={S.cardTitle}>
            🛠 DevTools
            <span style={badge('blue')}>@guideflow/devtools</span>
          </h2>
          <p style={{ margin: '0 0 14px', color: C.muted, fontSize: 13 }}>
            <code style={S.code}>@guideflow/devtools</code> is a Manifest V3 browser extension.
            This page exposes <code style={S.code}>window.__guideflow</code> so the extension's
            content script can detect the running instance automatically.
          </p>

          {/* Live status row */}
          <div style={{ ...S.row, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={badge(extDetected ? 'green' : 'amber')}>
                  {extDetected === null ? '⏳ Checking…' : extDetected ? '✓ window.__guideflow exposed' : '✗ Not exposed'}
                </span>
                <span style={{ fontSize: 12, color: C.subtle }}>Set by main.tsx on load</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={badge(studioActive ? 'green' : 'amber')}>
                  {studioActive ? '✓ guideflow studio active' : '○ guideflow studio not detected'}
                </span>
                <span style={{ fontSize: 12, color: C.subtle }}>
                  Run <code style={S.code}>pnpm guideflow studio</code> to inject{' '}
                  <code style={S.code}>__GUIDEFLOW_DEVTOOLS__</code>
                </span>
              </div>
            </div>
          </div>

          <hr style={S.hr} />

          {/* Install instructions */}
          <p style={S.label}>Installing the extension</p>
          <ol style={{ margin: '0 0 14px', padding: '0 0 0 18px', fontSize: 13, color: C.muted, lineHeight: 1.9 }}>
            <li>Clone this repo and run <code style={S.code}>pnpm --filter @guideflow/devtools build</code></li>
            <li>Open Chrome → <code style={S.code}>chrome://extensions</code> → Enable "Developer mode"</li>
            <li>Click <strong>Load unpacked</strong> → select <code style={S.code}>packages/devtools/dist/</code></li>
            <li>Navigate to any page running GuideFlow — the panel auto-connects via <code style={S.code}>window.__guideflow</code></li>
            <li>Open DevTools (<code style={S.code}>F12</code>) → select the <strong>GuideFlow</strong> panel tab</li>
          </ol>

          <hr style={S.hr} />

          {/* Panel tabs overview */}
          <p style={S.label}>DevTools panel tabs</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {([
              ['📡 Events', 'Streams all tour:*, step:*, hotspot:*, hint:* events in real-time with timestamps and payload inspection.'],
              ['🗂 Flows', 'Lists all registered FlowDefinitions. Inspect state graph, step contents, guards, and onEntry/onExit callbacks.'],
              ['🏗 Builder', 'Point-and-click element inspector. Click any element to generate a step stub targeting it (CSS selector auto-filled).'],
            ] as [string, string][]).map(([title, desc]) => (
              <div key={title} style={{ background: '#f8fafc', border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CLI ───────────────────────────────────────────────────────── */}
        <section id="gf-cli" style={S.card}>
          <h2 style={S.cardTitle}>
            ⌨️ CLI
            <span style={badge('blue')}>@guideflow/cli</span>
          </h2>
          <p style={{ margin: '0 0 14px', color: C.muted, fontSize: 13 }}>
            <code style={S.code}>@guideflow/cli</code> provides the <code style={S.code}>guideflow</code>{' '}
            binary. Install with <code style={S.code}>pnpm add -D @guideflow/cli</code> then run commands below.
          </p>

          {/* Command reference */}
          <p style={S.label}>Command reference</p>
          <div style={{ ...S.log, maxHeight: 'none', marginBottom: 16, fontSize: 12 }}>
            {([
              ['guideflow init [--dir <path>] [--framework react|vue|svelte]',
               'Scaffold guideflow.ts, an example flow, and optionally a framework provider component.'],
              ['guideflow studio [-p <port>] [--root <dir>]',
               'Start a Vite dev server on port 4747 (default) with __GUIDEFLOW_DEVTOOLS__ injected into index.html.'],
              ['guideflow export <file> [-o <out>] [--pretty]',
               'Read a .ts/.js/.json flow file and serialise it to <file>.flow.json (or -o path).'],
              ['guideflow push <file> [-k <apiKey>] [-e <endpoint>] [--env <name>]',
               'POST the flow JSON to api.guideflow.dev/v1/flows (or a custom endpoint).'],
            ] as [string, string][]).map(([cmd, desc]) => (
              <div key={cmd} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid #1e293b` }}>
                <div style={{ color: '#86efac', fontFamily: 'monospace', marginBottom: 3 }}>{`$ ${cmd}`}</div>
                <div style={{ color: '#94a3b8' }}>{desc}</div>
              </div>
            ))}
          </div>

          <hr style={S.hr} />

          {/* Flow exporter */}
          <p style={S.label}>In-browser flow exporter — reproduces <code style={S.code}>guideflow export</code></p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: C.subtle }}>
            Serialises a flow definition to JSON, replacing function values with <code style={S.code}>"[Function]"</code> annotations.
          </p>
          <div style={{ ...S.row, marginBottom: exportedJson ? 10 : 0 }}>
            <select
              value={exportFlowKey}
              onChange={(e) => { setExportFlowKey(e.target.value); setExportedJson(null) }}
              style={{ ...S.input, flex: 'none', width: 200 }}
            >
              {(['onboardingFlow', 'fsmBranchFlow', 'conditionalFlow', 'customActionsFlow'] as const).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <button style={btn('primary')} onClick={exportFlowJSON}>
              Export JSON
            </button>
          </div>
          {exportedJson && (
            <div style={{ position: 'relative' }}>
              <div style={{ ...S.log, maxHeight: 280, marginBottom: 0 }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, color: '#93c5fd' }}>
                  {exportedJson}
                </pre>
              </div>
              <button
                onClick={copyJSON}
                style={{ ...btn('secondary', { fontSize: 11, padding: '3px 10px', marginTop: 6 }) }}
              >
                {copied ? '✓ Copied!' : 'Copy to clipboard'}
              </button>
            </div>
          )}

          <hr style={S.hr} />

          {/* Push config */}
          <p style={S.label}>Push config — mirrors <code style={S.code}>guideflow push</code> options</p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: C.subtle }}>
            Typed by <code style={S.code}>PushOptions</code> from <code style={S.code}>@guideflow/cli</code>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={S.label as React.CSSProperties}>endpoint</label>
              <input
                style={S.input}
                value={pushConfig.endpoint}
                onChange={(e) => setPushConfig((p) => ({ ...p, endpoint: e.target.value }))}
                placeholder="https://api.guideflow.dev/v1/flows"
              />
            </div>
            <div>
              <label style={S.label as React.CSSProperties}>apiKey</label>
              <input
                style={S.input}
                type="password"
                value={pushConfig.apiKey ?? ''}
                onChange={(e) => setPushConfig((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="gf_sk_••••••••"
              />
            </div>
          </div>
          <div style={S.log as React.CSSProperties}>
            <span style={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: 11 }}>
              {'# Equivalent CLI command:\n'}
              {'$ guideflow push '}
              {exportFlowKey}.flow.json
              {pushConfig.apiKey ? ` -k ${pushConfig.apiKey.slice(0, 8)}…` : ''}
              {` -e ${pushConfig.endpoint}`}
            </span>
          </div>
        </section>

        {/* ── Analytics ─────────────────────────────────────────────────── */}
        <section id="gf-analytics" style={S.card}>
          <h2 ref={analyticsRef} style={S.cardTitle}>
            📊 Analytics
            <span style={badge('green')}>AnalyticsCollector</span>
          </h2>

          {/* Transport chain */}
          <p style={S.label as React.CSSProperties}>Transport chain (3 transports registered):</p>
          <div style={{ ...S.row, marginBottom: 14 }}>
            {['console', 'in-memory-buffer', 'webhook → /api/analytics'].map((t) => (
              <span key={t} style={badge('blue')}>{t}</span>
            ))}
          </div>

          {/* Captured events */}
          <p style={S.label}>Events captured by in-memory-buffer transport ({capturedEvents.length}):</p>
          {capturedEvents.length === 0 ? (
            <div style={S.log}><span style={{ color: '#475569' }}>Start a tour to see events here\u2026</span></div>
          ) : (
            <div style={S.log}>
              {capturedEvents.slice(-40).map((e, i) => (
                <div key={i}>
                  <span style={{ color: '#475569', marginRight: 8 }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: logColor(e.event) }}>{e.event}</span>
                  {e.properties && Object.keys(e.properties).length > 0 && (
                    <span style={{ color: '#64748b', marginLeft: 8 }}>{JSON.stringify(e.properties)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <hr style={S.hr} />

          {/* Live event log from gf.on(...) */}
          <p style={S.label}>Live tour event log (via gf.on) — last 80 events:</p>
          {eventLog.length === 0 ? (
            <div style={S.log}><span style={{ color: '#475569' }}>No events yet\u2026</span></div>
          ) : (
            <div style={S.log}>
              {eventLog.map((e, i) => (
                <div key={i} style={{ color: logColor(e.evt) }}>
                  <span style={{ color: '#475569', marginRight: 8 }}>{new Date(e.ts).toLocaleTimeString()}</span>
                  {e.evt}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
          <button style={{ ...btn('ghost'), marginTop: 6, fontSize: 11, color: C.subtle }} onClick={() => setEventLog([])}>
            Clear log
          </button>
        </section>

      </main>
    </div>
  )
}
