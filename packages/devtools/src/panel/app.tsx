import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GFTourEvent {
  event: string;
  args: unknown[];
  ts: number;
}

interface SelectedElement {
  selector: string;
  label?: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface StepDraft {
  id: string;
  title: string;
  body: string;
  target?: string;
  placement: string;
}

// ---------------------------------------------------------------------------
// Styles (inline — no external CSS deps needed in the panel)
// ---------------------------------------------------------------------------

const S = {
  root: {
    display: 'grid' as const,
    gridTemplateRows: 'auto 1fr',
    height: '100%',
    background: '#1e1e2e',
    color: '#cdd6f4',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#181825',
    borderBottom: '1px solid #313244',
  },
  badge: (active: boolean) => ({
    width: 8, height: 8, borderRadius: '50%',
    background: active ? '#a6e3a1' : '#6c7086',
    flexShrink: 0,
  }),
  title: { fontWeight: 600, fontSize: 14, color: '#cba6f7' },
  tabs: {
    display: 'flex',
    gap: 4,
    marginLeft: 'auto',
  },
  tab: (active: boolean) => ({
    padding: '3px 10px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    background: active ? '#313244' : 'transparent',
    color: active ? '#cdd6f4' : '#6c7086',
  }),
  body: { overflow: 'auto', padding: 12 },
  btn: (variant: 'primary' | 'danger' | 'ghost') => ({
    padding: '4px 12px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    background: variant === 'primary' ? '#6366f1' : variant === 'danger' ? '#f38ba8' : '#313244',
    color: variant === 'danger' ? '#1e1e2e' : '#cdd6f4',
    fontWeight: 500,
  }),
  card: {
    background: '#181825',
    border: '1px solid #313244',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    padding: '4px 8px',
    borderRadius: 4,
    border: '1px solid #45475a',
    background: '#313244',
    color: '#cdd6f4',
    fontSize: 12,
    marginBottom: 6,
  },
  label: { fontSize: 11, color: '#6c7086', marginBottom: 3, display: 'block' as const },
  row: { display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' },
  eventLine: (type: string) => ({
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '3px 6px',
    borderRadius: 3,
    marginBottom: 3,
    background: type.includes('abandon') || type.includes('skip') ? '#45102a' : '#1e1e2e',
    borderLeft: `3px solid ${type.includes('start') ? '#a6e3a1' : type.includes('end') ? '#f38ba8' : '#89b4fa'}`,
  }),
};

// ---------------------------------------------------------------------------
// PostMessage bridge (panel ↔ background ↔ content)
// ---------------------------------------------------------------------------

function sendToContent(msg: { type: string; payload?: unknown }) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, msg).catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'builder' | 'events' | 'flows';

// ---------------------------------------------------------------------------
// Builder tab
// ---------------------------------------------------------------------------

function BuilderTab() {
  const [inspecting, setInspecting] = useState(false);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [stepTitle, setStepTitle] = useState('');
  const [stepBody, setStepBody] = useState('');
  const [stepPlacement, setStepPlacement] = useState('bottom');

  useEffect(() => {
    const handler = (msg: { type: string; payload?: unknown }) => {
      if (msg.type === 'GF_ELEMENT_SELECTED') {
        setSelected(msg.payload as SelectedElement);
        setInspecting(false);
        sendToContent({ type: 'GF_STOP_INSPECT' });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const toggleInspect = () => {
    if (inspecting) {
      sendToContent({ type: 'GF_STOP_INSPECT' });
      setInspecting(false);
    } else {
      sendToContent({ type: 'GF_START_INSPECT' });
      setInspecting(true);
    }
  };

  const addStep = () => {
    if (!stepTitle) return;
    setSteps((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        title: stepTitle,
        body: stepBody,
        ...(selected?.selector !== undefined ? { target: selected.selector } : {}),
        placement: stepPlacement,
      },
    ]);
    setStepTitle('');
    setStepBody('');
    setSelected(null);
  };

  const runTour = () => {
    sendToContent({
      type: 'GF_START_TOUR',
      payload: { id: `devtools-tour-${Date.now()}`, steps },
    });
  };

  const copyJSON = () => {
    void navigator.clipboard.writeText(JSON.stringify({ id: 'my-tour', steps }, null, 2));
  };

  return (
    <div>
      <div style={S.row}>
        <button style={S.btn(inspecting ? 'danger' : 'primary')} onClick={toggleInspect}>
          {inspecting ? '⛶ Stop Inspect' : '⛶ Pick Element'}
        </button>
        {steps.length > 0 && (
          <>
            <button style={S.btn('primary')} onClick={runTour}>▶ Run Tour</button>
            <button style={S.btn('ghost')} onClick={copyJSON}>Copy JSON</button>
            <button style={S.btn('danger')} onClick={() => setSteps([])}>Clear</button>
          </>
        )}
      </div>

      {selected && (
        <div style={S.card}>
          <span style={S.label}>Selected: <code>{selected.selector}</code></span>
          <span style={S.label}>Label: {selected.label ?? '—'}</span>
        </div>
      )}

      <div style={S.card}>
        <span style={S.label}>Step title</span>
        <input
          style={S.input}
          value={stepTitle}
          onChange={(e) => setStepTitle(e.target.value)}
          placeholder="e.g. Click the Save button"
        />
        <span style={S.label}>Body</span>
        <input
          style={S.input}
          value={stepBody}
          onChange={(e) => setStepBody(e.target.value)}
          placeholder="Optional description…"
        />
        <span style={S.label}>Placement</span>
        <select
          style={S.input}
          value={stepPlacement}
          onChange={(e) => setStepPlacement(e.target.value)}
        >
          {['bottom', 'top', 'left', 'right', 'bottom-start', 'bottom-end', 'top-start', 'top-end', 'center'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button style={S.btn('primary')} onClick={addStep}>+ Add Step</button>
      </div>

      {steps.map((step, i) => (
        <div key={step.id} style={S.card}>
          <div style={{ ...S.row, marginBottom: 0 }}>
            <span style={{ color: '#6c7086', marginRight: 4 }}>{i + 1}.</span>
            <strong>{step.title}</strong>
            <button
              style={{ ...S.btn('danger'), marginLeft: 'auto', padding: '2px 7px' }}
              onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
            >✕</button>
          </div>
          {step.target && <div style={{ fontSize: 11, color: '#6c7086', marginTop: 3 }}>→ {step.target}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events tab
// ---------------------------------------------------------------------------

function EventsTab({ events }: { events: GFTourEvent[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => bottomRef.current?.scrollIntoView(), [events]);

  if (events.length === 0) {
    return <p style={{ color: '#6c7086', fontSize: 12 }}>No tour events yet. Start a tour on the page.</p>;
  }

  return (
    <div>
      {events.map((e, i) => (
        <div key={i} style={S.eventLine(e.event)}>
          <span style={{ color: '#6c7086', marginRight: 6 }}>
            {new Date(e.ts).toLocaleTimeString()}
          </span>
          <strong>{e.event}</strong>
          {e.args.length > 0 && (
            <span style={{ color: '#89b4fa', marginLeft: 6 }}>
              {e.args.map((a) => JSON.stringify(a)).join(' · ')}
            </span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flows tab
// ---------------------------------------------------------------------------

function FlowsTab({ flows }: { flows: unknown[] }) {
  if (flows.length === 0) {
    return <p style={{ color: '#6c7086', fontSize: 12 }}>No flows registered on this page.</p>;
  }
  return (
    <div>
      {flows.map((f, i) => (
        <div key={i} style={S.card}>
          <pre style={{ fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(f, null, 2)}
          </pre>
          <button
            style={{ ...S.btn('primary'), marginTop: 6 }}
            onClick={() => sendToContent({ type: 'GF_START_TOUR', payload: f })}
          >
            ▶ Run
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

function App() {
  const [tab, setTab] = useState<TabId>('builder');
  const [detected, setDetected] = useState(false);
  const [events, setEvents] = useState<GFTourEvent[]>([]);
  const [flows, setFlows] = useState<unknown[]>([]);

  useEffect(() => {
    const handler = (msg: { type: string; payload?: unknown }) => {
      if (msg.type === 'GF_DETECTED') setDetected(true);
      if (msg.type === 'GF_TOUR_EVENT') {
        const { event, args } = msg.payload as { event: string; args: unknown[] };
        setEvents((prev) => [...prev.slice(-199), { event, args, ts: Date.now() }]);
      }
      if (msg.type === 'GF_FLOWS_LIST') setFlows(msg.payload as unknown[]);
    };
    chrome.runtime.onMessage.addListener(handler);
    // Ping content on mount to check GuideFlow presence
    sendToContent({ type: 'GF_DEVTOOLS_OPEN' });
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  return (
    <div style={S.root}>
      <header style={S.header}>
        <div style={S.badge(detected)} />
        <span style={S.title}>GuideFlow</span>
        {!detected && <span style={{ fontSize: 11, color: '#6c7086' }}>not detected</span>}
        <div style={S.tabs}>
          {(['builder', 'events', 'flows'] as TabId[]).map((t) => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <div style={S.body}>
        {tab === 'builder' && <BuilderTab />}
        {tab === 'events' && <EventsTab events={events} />}
        {tab === 'flows' && <FlowsTab flows={flows} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<App />);
}
