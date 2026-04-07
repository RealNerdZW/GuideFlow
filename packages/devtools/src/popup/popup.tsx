import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabState {
  detected: boolean;
  eventCount: number;
  activeTour: { flowId: string; stepIndex: number; totalSteps: number } | null;
  lastEvents: Array<{ event: string; ts: number }>;
}

interface SavedTour {
  key: string;
  name: string;
  stepCount: number;
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Styles (Catppuccin Mocha)
// ---------------------------------------------------------------------------

const S = {
  root: {
    width: 400,
    minHeight: 500,
    background: '#1e1e2e',
    color: '#cdd6f4',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 16px',
    background: 'linear-gradient(135deg, #181825 0%, #1e1e2e 100%)',
    borderBottom: '1px solid #313244',
  },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: 'linear-gradient(135deg, #6366f1, #cba6f7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  title: { fontWeight: 700, fontSize: 15, color: '#cba6f7', lineHeight: '1.2' },
  subtitle: { fontSize: 11, color: '#6c7086', lineHeight: '1.3' },
  statusBar: (detected: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    fontSize: 12,
    background: detected ? 'rgba(166,227,161,0.08)' : 'rgba(108,112,134,0.08)',
    borderBottom: '1px solid #313244',
  }),
  dot: (active: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? '#a6e3a1' : '#6c7086',
    flexShrink: 0,
  }),
  body: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6c7086',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  card: {
    background: '#181825',
    border: '1px solid #313244',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  tourProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    background: '#313244',
    overflow: 'hidden' as const,
  },
  progressFill: (pct: number) => ({
    height: '100%',
    borderRadius: 3,
    background: 'linear-gradient(90deg, #6366f1, #cba6f7)',
    width: `${pct}%`,
    transition: 'width 0.3s ease',
  }),
  actionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  actionBtn: (variant: 'primary' | 'secondary' | 'danger' | 'accent') => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid',
    borderColor:
      variant === 'primary' ? '#6366f1'
      : variant === 'accent' ? '#cba6f7'
      : variant === 'danger' ? '#f38ba8'
      : '#313244',
    background:
      variant === 'primary' ? 'rgba(99,102,241,0.15)'
      : variant === 'accent' ? 'rgba(203,166,247,0.15)'
      : variant === 'danger' ? 'rgba(243,139,168,0.15)'
      : 'rgba(49,50,68,0.5)',
    color:
      variant === 'primary' ? '#818cf8'
      : variant === 'accent' ? '#cba6f7'
      : variant === 'danger' ? '#f38ba8'
      : '#cdd6f4',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.15s ease',
  }),
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    fontSize: 12,
    borderBottom: '1px solid #313244',
  },
  eventLine: {
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 4,
    marginBottom: 4,
    background: '#1e1e2e',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eventBadge: (type: string) => ({
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 3,
    fontWeight: 600,
    background:
      type.includes('start') ? 'rgba(166,227,161,0.2)'
      : type.includes('complete') ? 'rgba(137,180,250,0.2)'
      : type.includes('abandon') || type.includes('error') ? 'rgba(243,139,168,0.2)'
      : 'rgba(108,112,134,0.2)',
    color:
      type.includes('start') ? '#a6e3a1'
      : type.includes('complete') ? '#89b4fa'
      : type.includes('abandon') || type.includes('error') ? '#f38ba8'
      : '#6c7086',
  }),
  savedTour: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid rgba(49,50,68,0.5)',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '20px 12px',
    color: '#6c7086',
    fontSize: 12,
  },
  footer: {
    padding: '10px 16px',
    borderTop: '1px solid #313244',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    color: '#45475a',
  },
  link: {
    color: '#89b4fa',
    textDecoration: 'none',
    cursor: 'pointer',
    fontSize: 11,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId: number, msg: { type: string; payload?: unknown }): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    /* content script may not be loaded */
  }
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<TabState>({
    detected: false,
    eventCount: 0,
    activeTour: null,
    lastEvents: [],
  });
  const [savedTours, setSavedTours] = useState<SavedTour[]>([]);
  const [recording, setRecording] = useState(false);

  // Load state on mount
  useEffect(() => {
    void (async () => {
      const tab = await getActiveTab();
      if (!tab?.id) return;
      setTabId(tab.id);

      // Request state from service worker
      const resp: unknown = await chrome.runtime.sendMessage({ type: 'GF_GET_STATE', payload: { tabId: tab.id } });
      if (resp && typeof resp === 'object') {
        setState(resp as TabState);
      }

      // Load saved tours from storage
      const items = await chrome.storage.local.get(null);
      const tours: SavedTour[] = Object.entries(items)
        .filter(([k]) => k.startsWith('gf_flow_'))
        .map(([key, val]) => {
          const v = val as { id?: string; steps?: unknown[]; savedAt?: number };
          return {
            key,
            name: v.id ?? key.replace('gf_flow_', ''),
            stepCount: Array.isArray(v.steps) ? v.steps.length : 0,
            savedAt: v.savedAt ?? 0,
          };
        })
        .sort((a, b) => b.savedAt - a.savedAt);
      setSavedTours(tours);
    })();
  }, []);

  const handlePickElement = useCallback(async () => {
    if (!tabId) return;
    await sendToTab(tabId, { type: 'GF_START_INSPECT' });
    window.close();
  }, [tabId]);

  const handleToggleRecording = useCallback(async () => {
    if (!tabId) return;
    const type = recording ? 'GF_STOP_RECORDING' : 'GF_START_RECORDING';
    await sendToTab(tabId, { type });
    setRecording(!recording);
    if (!recording) window.close(); // Close popup so user can interact
  }, [tabId, recording]);

  const handleRunTour = useCallback(async (tour: SavedTour) => {
    if (!tabId) return;
    const items = await chrome.storage.local.get(tour.key);
    const flow: unknown = items[tour.key];
    if (flow) {
      await sendToTab(tabId, { type: 'GF_START_TOUR', payload: flow });
      window.close();
    }
  }, [tabId]);

  const handleDeleteTour = useCallback(async (key: string) => {
    await chrome.storage.local.remove(key);
    setSavedTours(prev => prev.filter(t => t.key !== key));
  }, []);

  const handleOpenDevTools = useCallback(() => {
    // Can't programmatically open DevTools — instruct user
    if (tabId) {
      void sendToTab(tabId, { type: 'GF_DEVTOOLS_OPEN' });
    }
    window.close();
  }, [tabId]);

  const tourProgress = state.activeTour
    ? Math.round(((state.activeTour.stepIndex + 1) / state.activeTour.totalSteps) * 100)
    : 0;

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>G</div>
        <div style={S.headerText}>
          <span style={S.title}>GuideFlow</span>
          <span style={S.subtitle}>Visual Tour Builder</span>
        </div>
      </div>

      {/* Status */}
      <div style={S.statusBar(state.detected)}>
        <div style={S.dot(state.detected)} />
        <span>{state.detected ? 'GuideFlow detected on this page' : 'GuideFlow not detected'}</span>
        <span style={{ marginLeft: 'auto', color: '#45475a' }}>v0.2.0</span>
      </div>

      <div style={S.body}>
        {/* Active Tour Progress */}
        {state.activeTour && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Active Tour</div>
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {state.activeTour.flowId}
              </div>
              <div style={S.tourProgress}>
                <span style={{ fontSize: 11, color: '#6c7086', whiteSpace: 'nowrap' as const }}>
                  Step {state.activeTour.stepIndex + 1}/{state.activeTour.totalSteps}
                </span>
                <div style={S.progressBar}>
                  <div style={S.progressFill(tourProgress)} />
                </div>
                <span style={{ fontSize: 11, color: '#cba6f7', fontWeight: 600 }}>{tourProgress}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Quick Actions</div>
          <div style={S.actionGrid}>
            <button
              style={S.actionBtn('primary')}
              onClick={() => void handlePickElement()}
              disabled={!state.detected}
              title={state.detected ? 'Pick an element on the page' : 'GuideFlow not detected'}
            >
              <span>⛶</span> Pick Element
            </button>
            <button
              style={S.actionBtn(recording ? 'danger' : 'accent')}
              onClick={() => void handleToggleRecording()}
              disabled={!state.detected}
              title={state.detected ? (recording ? 'Stop recording' : 'Record user interactions') : 'GuideFlow not detected'}
            >
              <span>{recording ? '⏹' : '⏺'}</span> {recording ? 'Stop Rec' : 'Record'}
            </button>
            <button
              style={S.actionBtn('secondary')}
              onClick={handleOpenDevTools}
              title="Open DevTools panel for advanced features"
            >
              <span>🛠</span> DevTools
            </button>
            <button
              style={S.actionBtn('secondary')}
              onClick={() => {
                if (tabId) void sendToTab(tabId, { type: 'GF_LIST_FLOWS' });
              }}
              disabled={!state.detected}
              title="Refresh detected flows"
            >
              <span>↻</span> Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Session Stats</div>
          <div style={S.card}>
            <div style={S.statRow}>
              <span>Events captured</span>
              <span style={{ color: '#89b4fa', fontWeight: 600 }}>{state.eventCount}</span>
            </div>
            <div style={{ ...S.statRow, borderBottom: 'none' }}>
              <span>Saved tours</span>
              <span style={{ color: '#cba6f7', fontWeight: 600 }}>{savedTours.length}</span>
            </div>
          </div>
        </div>

        {/* Recent Events */}
        {state.lastEvents.length > 0 && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Recent Events</div>
            <div style={S.card}>
              {state.lastEvents.slice(-5).reverse().map((evt, i) => (
                <div key={i} style={S.eventLine}>
                  <span style={S.eventBadge(evt.event)}>{evt.event}</span>
                  <span style={{ color: '#45475a' }}>{timeAgo(evt.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Saved Tours */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Saved Tours</div>
          {savedTours.length === 0 ? (
            <div style={S.emptyState}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
              <div>No saved tours yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Build tours in the DevTools panel</div>
            </div>
          ) : (
            <div style={S.card}>
              {savedTours.map(tour => (
                <div key={tour.key} style={S.savedTour}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{tour.name}</div>
                    <div style={{ fontSize: 10, color: '#6c7086' }}>
                      {tour.stepCount} steps
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{
                        background: 'rgba(99,102,241,0.2)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        color: '#818cf8',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                      onClick={() => void handleRunTour(tour)}
                      title="Run this tour"
                    >▶</button>
                    <button
                      style={{
                        background: 'rgba(243,139,168,0.15)',
                        border: 'none',
                        borderRadius: 4,
                        padding: '3px 8px',
                        color: '#f38ba8',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                      onClick={() => void handleDeleteTour(tour.key)}
                      title="Delete this tour"
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <span>GuideFlow DevTools v0.2.0</span>
        <a
          style={S.link}
          href="https://guideflow.dev"
          target="_blank"
          rel="noreferrer"
        >Docs</a>
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
