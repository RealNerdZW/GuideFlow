import path from 'node:path';

import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';

/**
 * Loads `packages/devtools/dist` as an unpacked MV3 extension.
 *
 * ## `channel: 'chromium'` is load-bearing
 *
 * Playwright's default headless Chromium is the **headless shell**, which
 * cannot load extensions at all. It does not error — it loads nothing and
 * reports nothing, so `context.serviceWorkers()` is simply `[]` and every
 * assertion below quietly has nothing to assert against. Measured:
 *
 * | launch options                          | serviceWorkers().length |
 * |-----------------------------------------|-------------------------|
 * | `{ headless: true }`                    | 0 — extension never loads |
 * | `{ headless: true, channel: 'chromium' }` | 1                     |
 *
 * That silent-zero-coverage failure is exactly what kept this repo's e2e suite
 * at a 0% pass rate for two phases while CI stayed green. Do not remove it.
 *
 * ## What this harness can and cannot reach
 *
 * Reachable: the service worker (`evaluate` runs inside it), `chrome.storage`,
 * the content script, the page, and any extension **page** —
 * `chrome-extension://<id>/recorder.html` opens like any other URL.
 *
 * **Not reachable: the DevTools panel.** Playwright cannot open a
 * `devtools_page`, and there is no CDP path to one. That is the reason the
 * Recorder is a page and not a panel tab (ADR-012).
 *
 * ## What a green run here does NOT prove
 *
 * A `--load-extension` profile reports `origins: ["<all_urls>"]` as already
 * granted. A real Chrome Web Store install does not. So these tests say
 * nothing about the permission prompt a real user would see.
 */
const EXTENSION_PATH = path.resolve(__dirname, '../../../packages/devtools/dist');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
}>({
  context: async ({ baseURL }, use) => {
    // A fresh profile per test: chrome.storage.local is profile-wide, so saved
    // flows would otherwise leak between tests in whatever order they ran.
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      ...(baseURL !== undefined && { baseURL }),
      viewport: { width: 1280, height: 900 },
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    // A generous timeout, not the default: the FIRST extension load in a cold
    // run has to create a profile and register the worker before anything can
    // be observed, and that intermittently overran the 5 s default — failing
    // the earliest test in the file and only that one, which reads like a
    // product bug rather than a startup race.
    worker ??= await context.waitForEvent('serviceworker', { timeout: 30_000 });
    await use(worker);
  },

  extensionId: async ({ serviceWorker }, use) => {
    // chrome-extension://<id>/background.js — the id is a hash of the unpacked
    // path, so it differs per machine and must never be hardcoded.
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;

/** The id of the tab under test, as the service worker sees it. */
export async function activeTabId(worker: Worker): Promise<number> {
  return worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id ?? -1;
  });
}
