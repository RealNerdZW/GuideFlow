/**
 * Recorder entry point.
 *
 * The target tab comes from `?tabId=`, put there by the service worker's
 * `GF_OPEN_RECORDER`. Deliberately NOT `chrome.devtools.inspectedWindow.tabId`
 * (this is not a DevTools page, so that API does not exist here) and
 * deliberately NOT `chrome.tabs.query({ active: true })` — in a tab, that
 * returns the Recorder's own tab.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';

import { RecorderApp } from './App.js';

const params = new URLSearchParams(window.location.search);
const raw = params.get('tabId');
const tabId = raw === null ? Number.NaN : Number.parseInt(raw, 10);

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  if (Number.isFinite(tabId)) {
    root.render(
      <React.StrictMode>
        <RecorderApp tabId={tabId} />
      </React.StrictMode>,
    );
  } else {
    // Opened by hand rather than through the extension. Say what is wrong
    // instead of rendering a Recorder wired to nothing.
    root.render(
      <div
        style={{
          background: '#1e1e2e',
          color: '#cdd6f4',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
          minHeight: '100vh',
        }}
      >
        <h1 style={{ fontSize: 16, color: '#f38ba8' }}>No tab to record</h1>
        <p style={{ fontSize: 13, maxWidth: 480 }}>
          The Recorder needs to know which tab it is recording. Open it from the GuideFlow
          toolbar icon, or from the DevTools panel, on the page you want to record.
        </p>
      </div>,
    );
  }
}
