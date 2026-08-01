/**
 * Inline styles for the Recorder — Catppuccin Mocha, matching the panel.
 *
 * Inline rather than a stylesheet because the extension's CSP is
 * `script-src 'self'; object-src 'self'` and a separate CSS file is one more
 * artefact the vite copy step has to place correctly. The panel already does
 * it this way; consistency beats novelty here.
 */
import type { CSSProperties } from 'react';

type Variant = 'primary' | 'danger' | 'ghost' | 'success' | 'warning';

const VARIANT_BG: Record<Variant, string> = {
  primary: '#585b70',
  danger: '#f38ba8',
  ghost: 'transparent',
  success: '#a6e3a1',
  warning: '#fab387',
};

const VARIANT_FG: Record<Variant, string> = {
  primary: '#cdd6f4',
  danger: '#11111b',
  ghost: '#a6adc8',
  success: '#11111b',
  warning: '#11111b',
};

export const S = {
  root: {
    background: '#1e1e2e',
    color: '#cdd6f4',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: 13,
    minHeight: '100vh',
  } as CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderBottom: '1px solid #313244',
    background: '#181825',
    position: 'sticky',
    top: 0,
  } as CSSProperties,

  title: { fontWeight: 600, color: '#cba6f7' } as CSSProperties,
  version: { fontSize: 11, color: '#6c7086' } as CSSProperties,
  tabLabel: { fontSize: 11, color: '#6c7086' } as CSSProperties,
  spacer: { flex: 1 } as CSSProperties,

  body: { padding: 14, maxWidth: 760, margin: '0 auto' } as CSSProperties,

  row: {
    display: 'flex',
    gap: 6,
    marginBottom: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  } as CSSProperties,

  input: {
    flex: 1,
    minWidth: 120,
    background: '#313244',
    border: '1px solid #45475a',
    borderRadius: 4,
    color: '#cdd6f4',
    padding: '6px 8px',
    fontSize: 12,
    fontFamily: 'inherit',
  } as CSSProperties,

  select: {
    background: '#313244',
    border: '1px solid #45475a',
    borderRadius: 4,
    color: '#cdd6f4',
    padding: '6px 8px',
    fontSize: 12,
  } as CSSProperties,

  btn: (variant: Variant): CSSProperties => ({
    background: VARIANT_BG[variant],
    color: VARIANT_FG[variant],
    border: variant === 'ghost' ? '1px solid #45475a' : 'none',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    cursor: 'pointer',
  }),

  card: (dragging: boolean): CSSProperties => ({
    background: '#181825',
    border: `1px solid ${dragging ? '#cba6f7' : '#313244'}`,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    listStyle: 'none',
    opacity: dragging ? 0.7 : 1,
  }),

  list: { padding: 0, margin: 0 } as CSSProperties,
  stepNo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    background: '#45475a',
    color: '#cdd6f4',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    flex: '0 0 auto',
  } as CSSProperties,

  empty: { color: '#6c7086', fontSize: 13, padding: '24px 0', textAlign: 'center' } as CSSProperties,

  captured: {
    background: '#181825',
    border: '1px solid #fab387',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  } as CSSProperties,
  capturedHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 } as CSSProperties,
  capturedRow: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 } as CSSProperties,

  code: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#89b4fa',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as CSSProperties,

  notice: (kind: 'error' | 'info'): CSSProperties => ({
    background: kind === 'error' ? '#45293a' : '#1e3a2f',
    border: `1px solid ${kind === 'error' ? '#f38ba8' : '#a6e3a1'}`,
    borderRadius: 4,
    padding: '6px 10px',
    marginBottom: 10,
    fontSize: 12,
  }),

  validation: (bad: boolean): CSSProperties => ({
    background: '#181825',
    border: `1px solid ${bad ? '#f38ba8' : '#313244'}`,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    fontSize: 12,
  }),

  issue: { marginTop: 6 } as CSSProperties,
  hint: { color: '#6c7086', fontSize: 11, marginTop: 2 } as CSSProperties,

  badgeBad: {
    background: '#f38ba8',
    color: '#11111b',
    borderRadius: 3,
    padding: '1px 5px',
    fontSize: 10,
  } as CSSProperties,
  badgeWarn: {
    background: '#fab387',
    color: '#11111b',
    borderRadius: 3,
    padding: '1px 5px',
    fontSize: 10,
  } as CSSProperties,
};
