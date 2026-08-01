import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { FlowDefinition } from '@guideflow/core';
import { test, expect } from '@playwright/test';

/**
 * Changing a tour without a code deploy.
 *
 * This is the whole of Phase 7.10's claim, and it is asserted the only way that
 * means anything: a `.flow.json` on disk is **rewritten between two assertions**
 * and the page picks up the change with no rebuild, no bundler, and no new
 * runtime API. Everything below uses shipped exports — `fetch`, `parseFlowFile`
 * and `gf.createFlow()`.
 *
 * There is deliberately no `loadFlows()` in the library. A flow file is a static
 * asset; the app already owns `fetch` with its auth, retries and tracing, and
 * `parseFlowFile` is a complete, non-throwing, validating reader at the trust
 * boundary. Wrapping that would reimplement the HTTP cache and drag the 5.35 kB
 * validator into production bundles.
 */

const FLOW_FILE = path.resolve(__dirname, '../fixtures/remote.flow.json');
const FLOW_URL = 'remote.flow.json';

/**
 * Serial, and it has to be.
 *
 * These tests REWRITE a shared file on disk — that is the point of them — so
 * running them in parallel means one test reading the malformed fixture another
 * just wrote. That failed exactly once, on the first test, and looked like a
 * product bug rather than the shared-state race it was.
 */
test.describe.configure({ mode: 'serial' });

/**
 * Built at runtime so TypeScript does not try to resolve it.
 *
 * These are browser URLs served by `serve.mjs` from the repo root, not module
 * specifiers this package can see — the same reason `fixtures/index.html`
 * imports them as literal paths.
 */
const CORE_URL = '/packages/core/dist/index.js';
const AUTHORING_URL = '/packages/core/dist/authoring.js';

/** Restore the fixture after each test — these mutate a file in the repo. */
let original: string;
test.beforeAll(() => {
  original = readFileSync(FLOW_FILE, 'utf8');
});
test.afterEach(() => {
  writeFileSync(FLOW_FILE, original);
});

test.beforeEach(async ({ page }) => {
  await page.goto('index.html'); // NOT '/' — see CLAUDE.md
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

/** The documented recipe, run in the page. Returns what the engine did with it. */
async function loadAndStart(
  page: import('@playwright/test').Page,
  url = FLOW_URL,
): Promise<{ valid: boolean; started: boolean; title: string | null; issues: string[] }> {
  return page.evaluate(async ({ u, authoringUrl }) => {
    const { parseFlowFile } = (await import(/* @vite-ignore */ authoringUrl)) as {
      parseFlowFile: (input: unknown) => {
        valid: boolean;
        // Narrowed only as far as this spec needs; the real type lives in
        // @guideflow/core/authoring, which this package cannot import because
        // the module is fetched from the served repo root at runtime.
        flow: (FlowDefinition & { id: string }) | null;
        errors: Array<{ code: string }>;
      };
    };
    const res = await fetch(u, { cache: 'no-store' });
    const parsed = parseFlowFile(await res.text());
    if (!parsed.valid || !parsed.flow) {
      return {
        valid: false,
        started: false,
        title: null,
        issues: parsed.errors.map((i) => i.code),
      };
    }
    const gf = window.__guideflow;
    gf.createFlow(parsed.flow);
    await gf.start(parsed.flow.id);
    return {
      valid: true,
      started: gf.isActive,
      title: document.querySelector('.gf-popover-title')?.textContent ?? null,
      issues: [],
    };
  }, { u: url, authoringUrl: AUTHORING_URL });
}

test.describe('a flow fetched at runtime', () => {
  test('loads, validates and runs with no new library API', async ({ page }) => {
    const result = await loadAndStart(page);
    expect(result.valid).toBe(true);
    expect(result.started).toBe(true);
    expect(result.title).toBe('Served over HTTP');
    await expect(page.locator('.gf-popover')).toBeVisible();
  });

  test('picks up an edit made on disk, with no rebuild', async ({ page }) => {
    // The claim, made concrete. Nothing is rebuilt between these two loads.
    const before = await loadAndStart(page);
    expect(before.title).toBe('Served over HTTP');

    const doc = JSON.parse(original) as {
      flow: { states: Record<string, { steps: Array<{ content: { title: string } }> }> };
    };
    doc.flow.states['s0']!.steps[0]!.content.title = 'Edited without a deploy';
    writeFileSync(FLOW_FILE, JSON.stringify(doc, null, 2));

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    const after = await loadAndStart(page);
    expect(after.title).toBe('Edited without a deploy');
  });

  test('a malformed flow is refused, not rendered', async ({ page }) => {
    // The trust boundary. `SECURITY-MODEL.md` classifies a flow fetched over the
    // network as untrusted, and `parseFlowFile` is what makes that real.
    writeFileSync(
      FLOW_FILE,
      JSON.stringify({
        gfFlowFile: 1,
        flow: {
          id: 'broken',
          initial: 'a',
          states: { a: { steps: [{ id: 's', content: { title: 't' } }], on: { NEXT: 'ghost' } } },
        },
      }),
    );

    const result = await loadAndStart(page);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('unknown-transition-target');
    await expect(page.locator('.gf-popover')).toHaveCount(0);
  });

  test('unparseable JSON is refused without throwing', async ({ page }) => {
    writeFileSync(FLOW_FILE, '{ this is not json ]');
    const result = await loadAndStart(page);
    expect(result.valid).toBe(false);
    expect(result.started).toBe(false);
  });
});

test.describe('HTTP semantics the recipe relies on', () => {
  test('the flow file is served with an ETag and revalidates to 304', async ({ page }) => {
    const first = await page.evaluate(async (u) => {
      const res = await fetch(u, { cache: 'no-store' });
      return { status: res.status, etag: res.headers.get('etag'), cc: res.headers.get('cache-control') };
    }, FLOW_URL);

    expect(first.status).toBe(200);
    expect(first.etag).toBeTruthy();
    // `no-cache` means revalidate every time, NOT "do not store" — which is
    // what a flow document wants: always fresh, cheap when unchanged.
    expect(first.cc).toBe('no-cache');

    const second = await page.evaluate(
      async ({ u, etag }) => {
        const res = await fetch(u, { cache: 'no-store', headers: { 'If-None-Match': etag ?? '' } });
        return res.status;
      },
      { u: FLOW_URL, etag: first.etag },
    );
    expect(second).toBe(304);
  });

  test('the ETag changes when the file changes', async ({ page }) => {
    const before = await page.evaluate(
      async (u) => (await fetch(u, { cache: 'no-store' })).headers.get('etag'),
      FLOW_URL,
    );

    const doc = JSON.parse(original) as Record<string, unknown>;
    writeFileSync(FLOW_FILE, `${JSON.stringify(doc, null, 4)}\n`);

    const after = await page.evaluate(
      async (u) => (await fetch(u, { cache: 'no-store' })).headers.get('etag'),
      FLOW_URL,
    );
    expect(after).not.toBe(before);
  });
});

test.describe('republishing reaches users who already finished', () => {
  test('a completed v1 does not suppress a structurally changed v2', async ({ page }) => {
    // The defect this phase fixed, end to end in a browser: completion was
    // keyed on the flow id alone and checked BEFORE the version gate, so
    // `start()` returned silently and nothing rendered.
    const outcome = await page.evaluate(async (coreUrl) => {
      const { createGuideFlow } = (await import(/* @vite-ignore */ coreUrl)) as {
        createGuideFlow: (config: unknown) => {
          start: (flow: unknown) => Promise<void>;
          next: () => Promise<void>;
          destroy: () => void;
          readonly isActive: boolean;
          readonly totalSteps: number;
        };
      };
      const base = {
        id: 'republish-e2e',
        initial: 'a',
        states: { a: { steps: [{ id: 's1', content: { title: 'v1' } }], final: true } },
      };
      const v1 = { ...base, version: 'one' };
      const v2 = {
        id: 'republish-e2e',
        initial: 'a',
        version: 'two',
        states: {
          a: { steps: [{ id: 's1', content: { title: 'v2' } }], on: { NEXT: 'b' } },
          b: { steps: [{ id: 's2', content: { title: 'v2 step two' } }], final: true },
        },
      };

      const first = createGuideFlow({ context: { userId: 'republisher' }, injectStyles: false });
      await first.start(v1);
      await first.next();
      const finished = !first.isActive;
      first.destroy();

      const second = createGuideFlow({ context: { userId: 'republisher' }, injectStyles: false });
      await second.start(v2);
      const sawV2 = second.isActive;
      const total = second.totalSteps;
      second.destroy();

      return { finished, sawV2, total };
    }, CORE_URL);

    expect(outcome.finished).toBe(true);
    expect(outcome.sawV2).toBe(true);
    expect(outcome.total).toBe(2);
  });
});
