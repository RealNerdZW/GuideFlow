import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface RecordedStep {
  action: string;
  selector: string;
  label: string;
  tagName: string;
  ts: number;
  value?: string;
}

interface ActiveTourState {
  isActive: boolean;
  currentStepId: string | null;
  currentStepIndex: number;
  totalSteps: number;
}

interface SavedTour {
  id: string;
  name: string;
  steps: StepDraft[];
  savedAt: number;
}

// ---------------------------------------------------------------------------
// Styles (inline — Catppuccin Mocha palette)
// ---------------------------------------------------------------------------

const S = {
  root: {
    display: 'grid' as const,
    gridTemplateRows: 'auto 1fr',
    height: '100%',
    background: '#1e1e2e',
    color: '#cdd6f4',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#181825',
    borderBottom: '1px solid #313244',
    flexWrap: 'wrap' as const,
  },
  badge: (active: boolean) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: active ? '#a6e3a1' : '#6c7086',
    flexShrink: 0,
  }),
  title: { fontWeight: 600, fontSize: 14, color: '#cba6f7' },
  versionBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 4,
    background: '#313244',
    color: '#89b4fa',
    fontFamily: 'monospace',
  },
  progressBar: {
    height: 3,
    background: '#313244',
    borderRadius: 2,
    flex: 1,
    minWidth: 60,
    maxWidth: 120,
    overflow: 'hidden' as const,
  },
  progressFill: (pct: number) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'linear-gradient(90deg, #6366f1, #cba6f7)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  }),
  tabs: {
    display: 'flex',
    gap: 2,
    marginLeft: 'auto',
  },
  tab: (active: boolean) => ({
    padding: '4px 10px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    background: active ? '#313244' : 'transparent',
    color: active ? '#cdd6f4' : '#6c7086',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    position: 'relative' as const,
  }),
  tabBadge: {
    fontSize: 9,
    padding: '0 4px',
    borderRadius: 8,
    background: '#6366f1',
    color: '#fff',
    fontWeight: 600,
    minWidth: 14,
    textAlign: 'center' as const,
    lineHeight: '14px',
  },
  body: { overflow: 'auto', padding: 12 },
  btn: (variant: 'primary' | 'danger' | 'ghost' | 'success' | 'warning') => ({
    padding: '5px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    background:
      variant === 'primary'
        ? '#6366f1'
        : variant === 'danger'
          ? '#f38ba8'
          : variant === 'success'
            ? '#a6e3a1'
            : variant === 'warning'
              ? '#fab387'
              : '#313244',
    color: variant === 'danger' || variant === 'success' || variant === 'warning' ? '#1e1e2e' : '#cdd6f4',
    transition: 'opacity 0.15s',
  }),
  card: {
    background: '#181825',
    border: '1px solid #313244',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  cardDragging: {
    background: '#181825',
    border: '2px dashed #6366f1',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    opacity: 0.6,
  },
  input: {
    width: '100%',
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid #45475a',
    background: '#313244',
    color: '#cdd6f4',
    fontSize: 12,
    marginBottom: 6,
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  label: { fontSize: 11, color: '#6c7086', marginBottom: 3, display: 'block' as const },
  row: { display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  eventLine: (type: string) => ({
    fontFamily: 'monospace',
    fontSize: 11,
    padding: '4px 8px',
    borderRadius: 4,
    marginBottom: 3,
    background: type.includes('abandon') || type.includes('skip') || type.includes('error')
      ? '#45102a'
      : '#1e1e2e',
    borderLeft: `3px solid ${
      type.includes('start')
        ? '#a6e3a1'
        : type.includes('complete')
          ? '#cba6f7'
          : type.includes('abandon') || type.includes('error')
            ? '#f38ba8'
            : '#89b4fa'
    }`,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }),
  chip: (active: boolean) => ({
    padding: '2px 8px',
    borderRadius: 12,
    border: `1px solid ${active ? '#6366f1' : '#45475a'}`,
    background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
    color: active ? '#89b4fa' : '#6c7086',
    cursor: 'pointer',
    fontSize: 11,
  }),
  empty: { color: '#6c7086', fontSize: 12, textAlign: 'center' as const, padding: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6c7086',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  separator: {
    borderTop: '1px solid #313244',
    margin: '12px 0',
  },
  toggle: (on: boolean) => ({
    width: 36,
    height: 20,
    borderRadius: 10,
    background: on ? '#6366f1' : '#45475a',
    border: 'none',
    cursor: 'pointer',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'background 0.2s',
  }),
  toggleDot: (on: boolean) => ({
    width: 16,
    height: 16,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    left: on ? 18 : 2,
    transition: 'left 0.2s',
  }),
  dragHandle: {
    cursor: 'grab',
    color: '#6c7086',
    fontSize: 14,
    userSelect: 'none' as const,
    padding: '0 4px',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendToContent(msg: { type: string; payload?: unknown }) {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  if (tabId) {
    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  }
}

/** Unique well-known event types for filter chips. */
const EVENT_TYPES = [
  'tour:start',
  'tour:complete',
  'tour:abandon',
  'step:enter',
  'step:exit',
  'step:skip',
  'tour:pause',
  'tour:resume',
  'tour:error',
  'hotspot:open',
  'hotspot:close',
  'hint:click',
  'progress:sync',
];

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type TabId = 'builder' | 'events' | 'flows' | 'settings';

const TAB_ICONS: Record<TabId, string> = {
  builder: '🔨',
  events: '📡',
  flows: '🔀',
  settings: '⚙',
};

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      style={S.toggle(on)}
      onClick={() => onChange(!on)}
      aria-label={on ? 'Turn off' : 'Turn on'}
    >
      <div style={S.toggleDot(on)} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Builder tab
// ---------------------------------------------------------------------------

function BuilderTab({
  selectedElement,
  onClearSelected,
  recording,
  onToggleRecording,
  recordedSteps,
  onClearRecordedSteps,
}: {
  selectedElement: SelectedElement | null;
  onClearSelected: () => void;
  recording: boolean;
  onToggleRecording: () => void;
  recordedSteps: RecordedStep[];
  onClearRecordedSteps: () => void;
}) {
  const [inspecting, setInspecting] = useState(false);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [stepTitle, setStepTitle] = useState('');
  const [stepBody, setStepBody] = useState('');
  const [stepPlacement, setStepPlacement] = useState('bottom');
  const [flowName, setFlowName] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedElement) setInspecting(false);
  }, [selectedElement]);

  // Import recorded steps into the builder
  const importRecorded = useCallback(() => {
    const newSteps: StepDraft[] = recordedSteps.map((rs, i) => ({
      id: `rec-${Date.now()}-${i}`,
      title: rs.label || `${rs.action} on ${rs.tagName}`,
      body: rs.action === 'input' ? `Enter value in ${rs.selector}` : `Click ${rs.selector}`,
      target: rs.selector,
      placement: 'bottom',
    }));
    setSteps((prev) => [...prev, ...newSteps]);
    onClearRecordedSteps();
  }, [recordedSteps, onClearRecordedSteps]);

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
        ...(selectedElement?.selector ? { target: selectedElement.selector } : {}),
        placement: stepPlacement,
      },
    ]);
    setStepTitle('');
    setStepBody('');
    onClearSelected();
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  };

  const moveStep = (from: number, to: number) => {
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  };

  const startEdit = (idx: number) => {
    setEditIdx(idx);
    setEditValue(steps[idx]?.title ?? '');
  };

  const commitEdit = () => {
    if (editIdx !== null && editValue.trim()) {
      setSteps((prev) => prev.map((s, i) => (i === editIdx ? { ...s, title: editValue.trim() } : s)));
    }
    setEditIdx(null);
    setEditValue('');
  };

  const runTour = () => {
    if (steps.length === 0) return;
    const flowId = flowName.trim() || `devtools-tour-${Date.now()}`;
    const flow = {
      id: flowId,
      initial: 'step-0',
      states: Object.fromEntries(
        steps.map((step, i) => [
          `step-${i}`,
          {
            steps: [
              {
                id: step.id,
                content: { title: step.title, body: step.body },
                ...(step.target ? { target: step.target } : {}),
                placement: step.placement,
              },
            ],
            on: i < steps.length - 1 ? { NEXT: `step-${i + 1}` } : {},
            ...(i === steps.length - 1 ? { final: true } : {}),
          },
        ]),
      ),
    };
    sendToContent({ type: 'GF_START_TOUR', payload: flow });
  };

  const saveTour = () => {
    const tourId = flowName.trim() || `tour-${Date.now()}`;
    chrome.runtime.sendMessage({
      type: 'GF_SAVE_FLOW',
      payload: { id: tourId, name: flowName || tourId, steps, savedAt: Date.now() },
    }).catch(() => {});
  };

  const exportJSON = () => {
    const data = JSON.stringify(
      { id: flowName.trim() || 'my-tour', name: flowName || 'My Tour', steps },
      null,
      2,
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flowName.trim() || 'guideflow-tour'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as {
          name?: string;
          steps?: StepDraft[];
        };
        if (data.name) setFlowName(data.name);
        if (Array.isArray(data.steps)) setSteps(data.steps);
      } catch {
        // Invalid JSON — ignore
      }
    };
    reader.readAsText(file);
    // Reset so re-importing the same file fires onChange
    e.target.value = '';
  };

  const highlightStep = (selector: string | undefined) => {
    if (selector) {
      sendToContent({ type: 'GF_HIGHLIGHT_SELECTOR', payload: selector });
    }
  };

  // ----- Drag handlers -----
  const onDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveStep(dragIdx, idx);
      setDragIdx(idx);
    }
  };
  const onDragEnd = () => setDragIdx(null);

  return (
    <div>
      {/* Flow name */}
      <div style={{ marginBottom: 10 }}>
        <span style={S.label}>Tour name</span>
        <input
          style={S.input}
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          placeholder="My Onboarding Tour"
        />
      </div>

      {/* Action bar */}
      <div style={S.row}>
        <button style={S.btn(inspecting ? 'danger' : 'primary')} onClick={toggleInspect}>
          {inspecting ? '⛶ Stop' : '⛶ Pick'}
        </button>
        <button
          style={S.btn(recording ? 'danger' : 'warning')}
          onClick={onToggleRecording}
        >
          {recording ? '⏹ Stop Rec' : '⏺ Record'}
        </button>
        {steps.length > 0 && (
          <>
            <button style={S.btn('success')} onClick={runTour}>▶ Run</button>
            <button style={S.btn('primary')} onClick={saveTour}>💾 Save</button>
            <button style={S.btn('ghost')} onClick={exportJSON}>⬇ Export</button>
            <button style={S.btn('danger')} onClick={() => setSteps([])}>✕ Clear</button>
          </>
        )}
        <button
          style={{ ...S.btn('ghost'), fontSize: 11 }}
          onClick={() => fileInputRef.current?.click()}
        >
          ⬆ Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={importJSON}
        />
      </div>

      {/* Selected element */}
      {selectedElement && (
        <div style={{ ...S.card, borderColor: '#6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#89b4fa' }}>
              🎯 <code style={{ fontSize: 11 }}>{selectedElement.selector}</code>
            </span>
            <button
              style={{ ...S.btn('ghost'), padding: '2px 6px', fontSize: 10 }}
              onClick={onClearSelected}
            >
              dismiss
            </button>
          </div>
          {selectedElement.label && (
            <div style={{ fontSize: 11, color: '#6c7086', marginTop: 2 }}>
              Label: {selectedElement.label}
            </div>
          )}
        </div>
      )}

      {/* Recorded steps banner */}
      {recordedSteps.length > 0 && (
        <div style={{ ...S.card, borderColor: '#fab387' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#fab387' }}>
              ⏺ {recordedSteps.length} recorded action{recordedSteps.length !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={S.btn('primary')} onClick={importRecorded}>Import All</button>
              <button style={S.btn('ghost')} onClick={onClearRecordedSteps}>Dismiss</button>
            </div>
          </div>
          {recordedSteps.slice(-3).map((rs, i) => (
            <div key={i} style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>
              {rs.action}: {rs.selector}
            </div>
          ))}
          {recordedSteps.length > 3 && (
            <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>
              …and {recordedSteps.length - 3} more
            </div>
          )}
        </div>
      )}

      {/* Step form */}
      <div style={S.card}>
        <span style={S.label}>Step title</span>
        <input
          style={S.input}
          value={stepTitle}
          onChange={(e) => setStepTitle(e.target.value)}
          placeholder="e.g. Click the Save button"
          onKeyDown={(e) => e.key === 'Enter' && addStep()}
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
          {[
            'bottom',
            'top',
            'left',
            'right',
            'bottom-start',
            'bottom-end',
            'top-start',
            'top-end',
            'center',
          ].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button style={S.btn('primary')} onClick={addStep}>
          + Add Step
        </button>
      </div>

      {/* Step list (draggable) */}
      {steps.length > 0 && (
        <div style={S.sectionTitle}>
          Steps ({steps.length})
        </div>
      )}
      {steps.map((step, i) => (
        <div
          key={step.id}
          style={dragIdx === i ? S.cardDragging : S.card}
          draggable
          onDragStart={onDragStart(i)}
          onDragOver={onDragOver(i)}
          onDragEnd={onDragEnd}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={S.dragHandle} title="Drag to reorder">⠿</span>
            <span style={{ color: '#6c7086', fontSize: 11, minWidth: 16 }}>{i + 1}.</span>
            {editIdx === i ? (
              <input
                style={{ ...S.input, marginBottom: 0, flex: 1 }}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                autoFocus
              />
            ) : (
              <strong
                style={{ flex: 1, cursor: 'text', fontSize: 12 }}
                onClick={() => startEdit(i)}
                title="Click to edit"
              >
                {step.title}
              </strong>
            )}
            <button
              style={{ ...S.btn('ghost'), padding: '2px 6px', fontSize: 11 }}
              onClick={() => highlightStep(step.target)}
              title="Preview on page"
            >
              👁
            </button>
            <button
              style={{ ...S.btn('danger'), padding: '2px 6px' }}
              onClick={() => removeStep(step.id)}
            >
              ✕
            </button>
          </div>
          {step.target && (
            <div style={{ fontSize: 10, color: '#6c7086', marginTop: 3, marginLeft: 30 }}>
              → <code style={{ fontSize: 10 }}>{step.target}</code>
            </div>
          )}
          {step.body && (
            <div style={{ fontSize: 10, color: '#585b70', marginTop: 2, marginLeft: 30 }}>
              {step.body}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events tab
// ---------------------------------------------------------------------------

function EventsTab({ events, onClear }: { events: GFTourEvent[]; onClear: () => void }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const toggleFilter = (type: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (activeFilters.size > 0 && !activeFilters.has(e.event)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          e.event.toLowerCase().includes(q) ||
          e.args.some((a) => JSON.stringify(a).toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [events, activeFilters, search]);

  // Collect which event types appear in the actual list
  const presentTypes = useMemo(() => {
    const s = new Set<string>();
    events.forEach((e) => s.add(e.event));
    return s;
  }, [events]);

  return (
    <div>
      {/* Search & controls */}
      <div style={S.row}>
        <input
          style={{ ...S.input, flex: 1, marginBottom: 0 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events…"
        />
        <button style={S.btn('danger')} onClick={onClear}>
          Clear
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ ...S.row, flexWrap: 'wrap' as const, gap: 4, marginBottom: 10 }}>
        {EVENT_TYPES.filter((t) => presentTypes.has(t)).map((type) => (
          <button
            key={type}
            style={S.chip(activeFilters.has(type))}
            onClick={() => toggleFilter(type)}
          >
            {type.replace('tour:', '').replace('step:', 's:').replace('hotspot:', 'hs:').replace('hint:', 'h:').replace('progress:', 'p:')}
          </button>
        ))}
      </div>

      {filteredEvents.length === 0 ? (
        <p style={S.empty}>
          {events.length === 0
            ? 'No tour events yet. Start a tour on the page.'
            : 'No events match your filters.'}
        </p>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: '#6c7086', marginBottom: 6 }}>
            Showing {filteredEvents.length} of {events.length} events
          </div>
          {filteredEvents.map((e, i) => (
            <div key={i} style={S.eventLine(e.event)}>
              <span style={{ color: '#6c7086', fontSize: 10, minWidth: 62, flexShrink: 0 }}>
                {formatTime(e.ts)}
              </span>
              <strong style={{ fontSize: 11 }}>{e.event}</strong>
              {e.args.length > 0 && (
                <span style={{ color: '#89b4fa', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.args.map((a) => JSON.stringify(a)).join(' · ')}
                </span>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flows tab
// ---------------------------------------------------------------------------

function FlowsTab({
  flows,
  savedTours,
  onDeleteSaved,
  onLoadSaved,
}: {
  flows: unknown[];
  savedTours: SavedTour[];
  onDeleteSaved: (id: string) => void;
  onLoadSaved: (tour: SavedTour) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div>
      {/* Saved tours */}
      {savedTours.length > 0 && (
        <>
          <div style={S.sectionTitle}>💾 Saved Tours ({savedTours.length})</div>
          {savedTours.map((tour) => (
            <div key={tour.id} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ flex: 1, fontSize: 12 }}>{tour.name}</strong>
                <span style={{ fontSize: 10, color: '#6c7086' }}>
                  {tour.steps.length} step{tour.steps.length !== 1 ? 's' : ''}
                </span>
                <button style={S.btn('primary')} onClick={() => onLoadSaved(tour)}>
                  Load
                </button>
                <button
                  style={{ ...S.btn('danger'), padding: '3px 8px' }}
                  onClick={() => onDeleteSaved(tour.id)}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: 10, color: '#6c7086', marginTop: 3 }}>
                Saved {new Date(tour.savedAt).toLocaleString()}
              </div>
            </div>
          ))}
          <div style={S.separator} />
        </>
      )}

      {/* Page flows */}
      <div style={S.sectionTitle}>🔀 Page Flows ({flows.length})</div>
      {flows.length === 0 ? (
        <p style={S.empty}>No flows registered on this page.</p>
      ) : (
        flows.map((f, i) => {
          const flow = f as { id?: string; initial?: string; states?: Record<string, unknown> };
          const stateCount = flow.states ? Object.keys(flow.states).length : 0;
          const isExpanded = expanded.has(i);
          return (
            <div key={i} style={S.card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  style={{ ...S.btn('ghost'), padding: '2px 6px', fontSize: 12 }}
                  onClick={() => toggleExpand(i)}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
                <strong style={{ flex: 1, fontSize: 12 }}>{flow.id ?? `Flow ${i + 1}`}</strong>
                <span style={{ fontSize: 10, color: '#6c7086' }}>
                  {stateCount} state{stateCount !== 1 ? 's' : ''}
                </span>
                <button
                  style={S.btn('primary')}
                  onClick={() => sendToContent({ type: 'GF_START_TOUR', payload: f })}
                >
                  ▶ Run
                </button>
              </div>
              {flow.initial && (
                <div style={{ fontSize: 10, color: '#6c7086', marginTop: 3 }}>
                  initial: <code style={{ fontSize: 10, color: '#89b4fa' }}>{flow.initial}</code>
                </div>
              )}
              {isExpanded && (
                <pre
                  style={{
                    fontSize: 10,
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    marginTop: 8,
                    padding: 8,
                    background: '#1e1e2e',
                    borderRadius: 4,
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(f, null, 2)}
                </pre>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function SettingsTab({
  debug,
  onToggleDebug,
  autoRecord,
  onToggleAutoRecord,
  savedTourCount,
  onExportAll,
  onClearData,
}: {
  debug: boolean;
  onToggleDebug: (v: boolean) => void;
  autoRecord: boolean;
  onToggleAutoRecord: (v: boolean) => void;
  savedTourCount: number;
  onExportAll: () => void;
  onClearData: () => void;
}) {
  return (
    <div>
      <div style={S.sectionTitle}>General</div>

      <div style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>Debug Mode</div>
          <div style={{ fontSize: 10, color: '#6c7086' }}>
            Enable verbose logging in the GuideFlow instance
          </div>
        </div>
        <Toggle on={debug} onChange={onToggleDebug} />
      </div>

      <div style={{ ...S.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>Auto-record on inspect</div>
          <div style={{ fontSize: 10, color: '#6c7086' }}>
            Automatically start recording when Pick Element is used
          </div>
        </div>
        <Toggle on={autoRecord} onChange={onToggleAutoRecord} />
      </div>

      <div style={S.separator} />
      <div style={S.sectionTitle}>Data</div>

      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>Saved Tours</div>
            <div style={{ fontSize: 10, color: '#6c7086' }}>
              {savedTourCount} tour{savedTourCount !== 1 ? 's' : ''} stored locally
            </div>
          </div>
          <button style={S.btn('primary')} onClick={onExportAll}>
            ⬇ Export All
          </button>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#f38ba8' }}>Clear All Data</div>
            <div style={{ fontSize: 10, color: '#6c7086' }}>
              Remove all saved tours from local storage
            </div>
          </div>
          <button style={S.btn('danger')} onClick={onClearData}>
            Clear
          </button>
        </div>
      </div>

      <div style={S.separator} />
      <div style={S.sectionTitle}>About</div>
      <div style={S.card}>
        <div style={{ fontSize: 12 }}>GuideFlow DevTools</div>
        <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>
          Visual tour builder and flow inspector for GuideFlow.js
        </div>
        <div style={{ fontSize: 10, color: '#6c7086', marginTop: 2 }}>
          Extension v0.1.9 · <a href="https://github.com/RealNerdZW/GuideFlow" target="_blank" rel="noopener" style={{ color: '#89b4fa' }}>GitHub</a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

function App() {
  const [tab, setTab] = useState<TabId>('builder');
  const [detected, setDetected] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [events, setEvents] = useState<GFTourEvent[]>([]);
  const [flows, setFlows] = useState<unknown[]>([]);
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>([]);
  const [activeTour, setActiveTour] = useState<ActiveTourState | null>(null);
  const [savedTours, setSavedTours] = useState<SavedTour[]>([]);
  const [debug, setDebug] = useState(false);
  const [autoRecord, setAutoRecord] = useState(false);

  // Load saved tours on mount
  const loadSavedTours = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GF_LOAD_FLOWS' }, (resp: unknown) => {
      const r = resp as { flows?: Array<{ id?: string; name?: string; steps?: StepDraft[]; savedAt?: number }> } | undefined;
      if (r?.flows) {
        const tours = r.flows
          .filter((f) => Array.isArray(f.steps))
          .map((f) => ({
            id: f.id ?? `tour-${Date.now()}`,
            name: f.name ?? f.id ?? 'Untitled',
            steps: f.steps ?? [],
            savedAt: f.savedAt ?? 0,
          }));
        setSavedTours(tours);
      }
    });
  }, []);

  // Load settings from storage
  useEffect(() => {
    chrome.storage.local.get(['gf_settings'], (items) => {
      const settings = items['gf_settings'] as { debug?: boolean; autoRecord?: boolean } | undefined;
      if (settings) {
        if (settings.debug !== undefined) setDebug(settings.debug);
        if (settings.autoRecord !== undefined) setAutoRecord(settings.autoRecord);
      }
    });
  }, []);

  const saveSettings = useCallback(
    (d: boolean, ar: boolean) => {
      void chrome.storage.local.set({ gf_settings: { debug: d, autoRecord: ar } });
    },
    [],
  );

  const handleToggleDebug = useCallback(
    (v: boolean) => {
      setDebug(v);
      saveSettings(v, autoRecord);
      sendToContent({ type: 'GF_SET_DEBUG', payload: v });
    },
    [autoRecord, saveSettings],
  );

  const handleToggleAutoRecord = useCallback(
    (v: boolean) => {
      setAutoRecord(v);
      saveSettings(debug, v);
    },
    [debug, saveSettings],
  );

  const handleToggleRecording = useCallback(() => {
    if (recording) {
      sendToContent({ type: 'GF_STOP_RECORDING' });
      setRecording(false);
    } else {
      setRecordedSteps([]);
      sendToContent({ type: 'GF_START_RECORDING' });
      setRecording(true);
    }
  }, [recording]);

  const deleteSavedTour = useCallback(
    (id: string) => {
      chrome.runtime.sendMessage({ type: 'GF_DELETE_FLOW', payload: { key: `gf_flow_${id}` } }, () => {
        loadSavedTours();
      });
    },
    [loadSavedTours],
  );

  const exportAllTours = useCallback(() => {
    const data = JSON.stringify(savedTours, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guideflow-all-tours.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [savedTours]);

  const clearAllData = useCallback(() => {
    chrome.storage.local.clear(() => {
      setSavedTours([]);
    });
  }, []);

  useEffect(() => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    const port = chrome.runtime.connect({ name: `devtools:${tabId}` });

    const portHandler = (msg: { type: string; payload?: unknown }) => {
      switch (msg.type) {
        case 'GF_DETECTED': {
          setDetected(true);
          const pl = msg.payload as { version?: string } | undefined;
          if (pl?.version) setVersion(pl.version);
          break;
        }
        case 'GF_TOUR_EVENT': {
          const { event, args } = msg.payload as { event: string; args: unknown[] };
          setEvents((prev) => [...prev.slice(-499), { event, args, ts: Date.now() }]);
          break;
        }
        case 'GF_FLOWS_LIST':
          setFlows(msg.payload as unknown[]);
          break;
        case 'GF_ELEMENT_SELECTED':
          setSelectedElement(msg.payload as SelectedElement);
          break;
        case 'GF_RECORDED_STEP':
          setRecordedSteps((prev) => [...prev, msg.payload as RecordedStep]);
          break;
        case 'GF_RECORDING_STOPPED':
          setRecording(false);
          break;
        case 'GF_ACTIVE_TOUR_STATE':
          setActiveTour(msg.payload as ActiveTourState);
          break;
        case 'GF_QUICK_TOUR_ELEMENT': {
          // Context menu "Quick Tour from Here" — switch to builder and populate
          setSelectedElement(msg.payload as SelectedElement);
          setTab('builder');
          break;
        }
      }
    };
    port.onMessage.addListener(portHandler);

    // Ping content on mount
    sendToContent({ type: 'GF_DEVTOOLS_OPEN' });

    // Load saved tours
    loadSavedTours();

    return () => {
      port.disconnect();
    };
  }, [loadSavedTours]);

  const progressPct =
    activeTour && activeTour.totalSteps > 0
      ? Math.round(((activeTour.currentStepIndex + 1) / activeTour.totalSteps) * 100)
      : 0;

  return (
    <div style={S.root}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.badge(detected)} />
        <span style={S.title}>GuideFlow</span>
        {version && <span style={S.versionBadge}>v{version}</span>}
        {!detected && <span style={{ fontSize: 11, color: '#6c7086' }}>not detected</span>}

        {/* Active tour progress */}
        {activeTour?.isActive && (
          <>
            <div style={S.progressBar}>
              <div style={S.progressFill(progressPct)} />
            </div>
            <span style={{ fontSize: 10, color: '#a6e3a1' }}>
              {activeTour.currentStepIndex + 1}/{activeTour.totalSteps}
            </span>
          </>
        )}

        {/* Tabs */}
        <div style={S.tabs}>
          {(['builder', 'events', 'flows', 'settings'] as TabId[]).map((t) => (
            <button key={t} style={S.tab(tab === t)} onClick={() => setTab(t)}>
              <span>{TAB_ICONS[t]}</span>
              <span>{t}</span>
              {t === 'events' && events.length > 0 && (
                <span style={S.tabBadge}>{events.length > 99 ? '99+' : events.length}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div style={S.body}>
        {tab === 'builder' && (
          <BuilderTab
            selectedElement={selectedElement}
            onClearSelected={() => setSelectedElement(null)}
            recording={recording}
            onToggleRecording={handleToggleRecording}
            recordedSteps={recordedSteps}
            onClearRecordedSteps={() => setRecordedSteps([])}
          />
        )}
        {tab === 'events' && (
          <EventsTab events={events} onClear={() => setEvents([])} />
        )}
        {tab === 'flows' && (
          <FlowsTab
            flows={flows}
            savedTours={savedTours}
            onDeleteSaved={deleteSavedTour}
            onLoadSaved={(_tour) => {
              // Load a saved tour into builder
              setTab('builder');
              // Use a small timeout so tab switch renders first
              setTimeout(() => {
                setSelectedElement(null);
              }, 0);
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            debug={debug}
            onToggleDebug={handleToggleDebug}
            autoRecord={autoRecord}
            onToggleAutoRecord={handleToggleAutoRecord}
            savedTourCount={savedTours.length}
            onExportAll={exportAllTours}
            onClearData={clearAllData}
          />
        )}
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
