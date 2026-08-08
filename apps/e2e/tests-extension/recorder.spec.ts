import { activeTabId, expect, test } from './fixtures';

/**
 * The first tests in this repo that exercise the extension in a browser.
 *
 * CLAUDE.md has recorded for four phases that the Phase 3 devtools hardening
 * "has still not been exercised in a browser" and that a mismatch "would
 * present as silence, not an error". These are that exercise.
 *
 * **What they prove:** the built `dist/` loads as a real MV3 extension; the
 * service worker registers; the content script injects on a real http origin;
 * the page-world bridge executes and detection reaches the background badge;
 * recording survives a full navigation; captured steps survive with no UI
 * open; the Recorder page loads, validates, and refuses to export a broken
 * tour; and `buildSelector`'s output resolves to exactly one element in a real
 * layout engine.
 *
 * **What they do not prove:** anything about the DevTools panel as a DevTools
 * panel (Playwright cannot open one), the popup as a popup, context menus, or
 * the permission prompt a Web Store install would show — a `--load-extension`
 * profile is more permissive than a real one.
 */

const FIXTURE = 'index.html';

test.describe('extension loads and detects', () => {
  test('the service worker registers and the extension has an id', async ({
    serviceWorker,
    extensionId,
  }) => {
    expect(extensionId).toMatch(/^[a-z]{32}$/);
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
    // Retired in 7.9b: nothing ever called chrome.permissions.request, and an
    // ungranted optional host permission is the one thing that can put a
    // Site-access control in front of a user and silently withhold the
    // statically declared content script.
    expect(manifest.optional_host_permissions).toBeUndefined();
  });

  test('the content script injects and the bridge reports detection', async ({
    context,
    serviceWorker,
  }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE); // NOT '/' — see CLAUDE.md
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();

    const tabId = await activeTabId(serviceWorker);

    // The fixture sets window.__guideflow; the bridge sees it, the content
    // script relays GF_DETECTED, the worker flips the badge. Four hops, one
    // assertion — and the whole nonce handshake and relay allowlist sit on
    // that path.
    //
    // `{ tabId }`, not `{}`: updateBadge() sets the text per tab, and
    // getBadgeText({}) reads the global default, which is always ''.
    await expect
      .poll(
        () => serviceWorker.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId),
        { timeout: 10_000 },
      )
      .toBe('ON');
  });
});

test.describe('recording', () => {
  test('captures a click, with a selector that resolves to exactly one element', async ({
    context,
    serviceWorker,
  }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await expect(page.locator('#__gf_recording_badge__')).toBeVisible();

    await page.click('#step-one');

    const steps = await pollSteps(serviceWorker, tabId, 1);
    expect(steps[0]?.action).toBe('click');
    expect(steps[0]?.unique).toBe(true);

    // The assertion a unit test structurally cannot make: the emitted selector,
    // re-queried against a real document with a real layout engine, resolves to
    // exactly one element — and it is the one that was clicked.
    const resolved = await page.evaluate((sel) => {
      const found = document.querySelectorAll(sel);
      return { count: found.length, id: found[0]?.id ?? null };
    }, steps[0]?.selector ?? '');
    expect(resolved.count).toBe(1);
    expect(resolved.id).toBe('step-one');
  });

  test('survives a full page navigation', async ({ context, serviceWorker }) => {
    // The defect this closes: a navigation destroyed the content script and
    // every module-scope variable in it, so recording silently ended while the
    // UI still said "Stop Rec". The flag lives in the worker now, and the
    // content script asks for it on load.
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.click('#step-one');
    await pollSteps(serviceWorker, tabId, 1);

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);

    // Re-armed by the content script asking the worker, with no UI involved.
    await expect(page.locator('#__gf_recording_badge__')).toBeVisible({ timeout: 10_000 });

    await page.click('#step-two');
    const steps = await pollSteps(serviceWorker, tabId, 2);
    // And the first step was not lost across the navigation.
    expect(steps).toHaveLength(2);
  });

  test('buffers steps with no extension page open at all', async ({ context, serviceWorker }) => {
    // Popup-armed recording used to capture nothing by construction: the
    // worker posted each step straight at `devtoolsPorts.get(tabId)` and
    // dropped it when that was undefined.
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.click('#step-one');
    await page.click('#step-two');

    expect(await pollSteps(serviceWorker, tabId, 2)).toHaveLength(2);
  });
});

test.describe('the Recorder page', () => {
  test('opens, replays the buffered session, and validates the draft', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.click('#step-one');
    await page.click('#step-two');
    await pollSteps(serviceWorker, tabId, 2);

    // Open the Recorder AFTER recording — the steps must already be waiting.
    const recorder = await context.newPage();
    await recorder.goto(`chrome-extension://${extensionId}/recorder.html?tabId=${String(tabId)}`);

    await expect(recorder.locator('#gf-import-captured')).toBeVisible();
    await recorder.locator('#gf-import-captured').click();

    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(2);
    // Two steps, both anchored, nothing missing: the draft is shippable.
    await expect(recorder.locator('#gf-validation')).toContainText('valid');
    await expect(recorder.locator('#gf-export-btn')).toBeEnabled();
  });

  test('refuses to export a draft it knows is broken', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.click('#step-one');
    await pollSteps(serviceWorker, tabId, 1);

    const recorder = await context.newPage();
    await recorder.goto(`chrome-extension://${extensionId}/recorder.html?tabId=${String(tabId)}`);
    await recorder.locator('#gf-import-captured').click();
    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(1);

    // Blank the title. `step-missing-content` is an error: the renderer would
    // have nothing to paint.
    const title = recorder.getByLabel('Step 1 title');
    await title.fill('');

    await expect(recorder.locator('#gf-validation')).toContainText('error');
    await expect(recorder.locator('#gf-export-btn')).toBeDisabled();
    await expect(recorder.locator('#gf-run-btn')).toBeDisabled();
  });

  test('a draft survives closing and reopening the Recorder', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // The Builder tab destroyed every unsaved step when you switched to the
    // Events tab, because its state was React state in a conditionally
    // mounted component. The Recorder mirrors the draft into
    // chrome.storage.session.
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    const url = `chrome-extension://${extensionId}/recorder.html?tabId=${String(tabId)}`;
    let recorder = await context.newPage();
    await recorder.goto(url);
    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.bringToFront();
    await page.click('#step-one');
    await recorder.bringToFront();
    await recorder.locator('#gf-import-captured').click();
    await recorder.getByLabel('Tour name').fill('My saved draft');
    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(1);

    await recorder.close();
    recorder = await context.newPage();
    await recorder.goto(url);

    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(1);
    await expect(recorder.getByLabel('Tour name')).toHaveValue('My saved draft');
  });

  test('its own buttons can actually reach the page', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // Every other test in this file arms recording by messaging the content
    // script FROM THE WORKER, so the Recorder's outbound path — the Record
    // button, Preview, Check, Save — had never been exercised at all. It was
    // broken from the day it shipped: the worker classified an extension page
    // as "our own" by `sender.tab === undefined`, which is false for a page in
    // an ordinary tab, so `GF_SEND_TO_TAB` fell through the provenance gate
    // and got no response. Clicking the button is the assertion.
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    const recorder = await context.newPage();
    await recorder.goto(`chrome-extension://${extensionId}/recorder.html?tabId=${String(tabId)}`);
    await recorder.locator('#gf-record-btn').click();

    await expect(page.locator('#__gf_recording_badge__')).toBeVisible({ timeout: 10_000 });
    await expect(recorder.locator('#gf-record-btn')).toContainText('Stop recording');
    await expect(recorder.locator('#gf-status')).toHaveCount(0);
  });

  test('inserts, reorders and deletes a step without re-recording', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // "One bad step means re-record the whole thing" is the reason a recorder
    // gets abandoned after the first session. None of this list surgery is
    // reachable from a unit test: `steps.ts` is pure and pinned there, and this
    // is the wiring — including the keyboard reorder, which is the ONLY
    // reorder for anyone not using a pointer.
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.click('#step-one');
    await page.click('#step-two');
    await pollSteps(serviceWorker, tabId, 2);

    const recorder = await context.newPage();
    await recorder.goto(`chrome-extension://${extensionId}/recorder.html?tabId=${String(tabId)}`);
    await recorder.locator('#gf-import-captured').click();
    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(2);

    // A step was forgotten between the two that were recorded.
    await recorder.getByLabel('Insert a step below step 1').click();
    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(3);
    // The caret is already in the new step's title, so it can be typed into
    // without reaching for the mouse.
    await recorder.keyboard.type('The forgotten step');
    await expect(recorder.getByLabel('Step 2 title')).toHaveValue('The forgotten step');
    await recorder.getByLabel('Step 2 target').fill('#step-three');

    // Reorder from the keyboard alone. The drag-and-drop this sits beside
    // cannot be driven by one.
    await recorder.getByLabel('Move step 2 down').press('Enter');
    await expect(recorder.getByLabel('Step 3 title')).toHaveValue('The forgotten step');
    // Focus followed the step it moved. React re-inserts the node to reorder
    // it, and a node that leaves the document resets focus to <body> — so
    // without the deliberate restore, one keyboard move strands the user at
    // the top of the page. The step landed last, which DISABLES the button
    // that got it there, and a disabled button cannot hold focus: the restore
    // falls back to its opposite number, which is always live in that case.
    await expect(recorder.getByLabel('Move step 3 down')).toBeDisabled();
    await expect(recorder.getByLabel('Move step 3 up')).toBeFocused();
    // `toContainText`, not `toHaveText`: every announcement now carries an
    // invisible U+200B on alternate turns — see the identical-announcement
    // assertion below.
    await expect(recorder.locator('#gf-live')).toContainText('Moved to position 3 of 3.');

    // Deleting the middle one leaves the other two and the draft still valid.
    await recorder.getByLabel('Delete step 2').click();
    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(2);
    await expect(recorder.locator('#gf-validation')).toContainText('valid');
    await expect(recorder.locator('#gf-export-btn')).toBeEnabled();

    // ── An IDENTICAL announcement must still reach the live region ─────────
    //
    // The defect: `setAnnouncement(text)` wrote the string straight into the
    // region, and React does not touch a text node whose string is unchanged.
    // Two steps left, so moving the top one down says "Moved to position 2 of
    // 2." every time — and the second one produced no DOM mutation at all, so
    // nothing was announced. Silent, invisible, and only a screen-reader user
    // is affected.
    //
    // The assertion is on the RAW textContent, not on `toHaveText`: Playwright
    // normalises the marker away, which is exactly the thing under test.
    const liveRaw = (): Promise<string> =>
      recorder.locator('#gf-live').evaluate((el) => el.textContent ?? '');
    const spoken = (raw: string): string => raw.replace(/\u200B/g, '').trim();

    await recorder.getByLabel('Move step 1 down').press('Enter');
    await expect.poll(async () => spoken(await liveRaw())).toBe('Moved to position 2 of 2.');
    const first = await liveRaw();

    await recorder.getByLabel('Move step 1 down').press('Enter');
    // Same sentence, different node content. A live region whose content does
    // not change is not spoken again, so this inequality IS the announcement.
    await expect.poll(liveRaw).not.toBe(first);
    expect(spoken(await liveRaw())).toBe('Moved to position 2 of 2.');

    // Ids stayed unique across all of that — a collision would have thrown
    // inside draftToFlow and disabled Export with no visible cause.
    const ids = await recorder.locator('#gf-step-list > li').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-step-id')),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('re-records one step target, keeping its title and body', async ({
    context,
    serviceWorker,
    extensionId,
  }) => {
    // The headline of 8.8. It reuses INSPECT mode rather than recording:
    // recording appends a stream of actions, which is the shape that cannot
    // repair a single step. Four hops — recorder → worker → content script →
    // page click → back — and the assertion goes red if any of them stops
    // routing `GF_ELEMENT_SELECTED` to the Recorder's port.
    const page = await context.newPage();
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__gfReady === true);
    await page.bringToFront();
    const tabId = await activeTabId(serviceWorker);

    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await page.click('#step-one');
    await pollSteps(serviceWorker, tabId, 1);
    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_STOP_RECORDING' }),
      tabId,
    );

    const recorder = await context.newPage();
    await recorder.goto(`chrome-extension://${extensionId}/recorder.html?tabId=${String(tabId)}`);
    await recorder.locator('#gf-import-captured').click();
    await recorder.getByLabel('Step 1 title').fill('Open the thing');
    await recorder.getByLabel('Step 1 body').fill('It is over here.');
    await expect(recorder.getByLabel('Step 1 target')).toHaveValue('#step-one');

    await recorder.getByLabel('Re-record the target of step 1').click();
    await expect(recorder.locator('#gf-status')).toContainText('click the element');

    // ── The pick/record interlock, both ways ───────────────────────────────
    //
    // A pick and a recording cannot both own the document's capture-phase
    // click listener — inspect calls `stopPropagation`, not
    // `stopImmediatePropagation`, so a pick taken mid-recording ALSO lands in
    // the captured buffer. The re-record button was already disabled while
    // recording; nothing stopped recording starting while a pick was pending.
    await expect(recorder.locator('#gf-record-btn')).toBeDisabled();

    // And the state is still reachable from outside this page — the popup, a
    // context menu, the worker. A pending pick that cannot be called off from
    // there silently consumes the next element the user selects for any other
    // reason, so Cancel stays live even while recording.
    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_START_RECORDING' }),
      tabId,
    );
    await expect(recorder.locator('#gf-record-btn')).toContainText('Stop recording');
    await expect(recorder.getByLabel('Cancel re-recording step 1')).toBeEnabled();
    await serviceWorker.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'GF_STOP_RECORDING' }),
      tabId,
    );
    await expect(recorder.locator('#gf-record-btn')).toContainText('Record');

    // The user goes back to their app and clicks the RIGHT element this time.
    await page.bringToFront();
    await page.click('#step-three');

    await recorder.bringToFront();
    await expect(recorder.getByLabel('Step 1 target')).toHaveValue('#step-three');
    // Only the target moved.
    await expect(recorder.getByLabel('Step 1 title')).toHaveValue('Open the thing');
    await expect(recorder.getByLabel('Step 1 body')).toHaveValue('It is over here.');
    // And it did not also land in the captured buffer as a new step.
    await expect(recorder.locator('#gf-step-list > li')).toHaveCount(1);
  });

  test('says so plainly when opened with no tab to record', async ({ context, extensionId }) => {
    const recorder = await context.newPage();
    await recorder.goto(`chrome-extension://${extensionId}/recorder.html`);
    await expect(recorder.getByText('No tab to record')).toBeVisible();
  });
});

/**
 * Poll the worker's recording buffer until it holds at least `count` steps.
 *
 * Read out of `chrome.storage.session`, not by messaging the worker: Chrome
 * does not deliver `chrome.runtime.sendMessage` back to the sender's own
 * context, so a worker asking itself gets "Could not establish connection.
 * Receiving end does not exist." The worker writes its buffer through to
 * session storage precisely so it survives eviction — which makes storage the
 * honest thing to assert on.
 */
async function pollSteps(
  worker: import('@playwright/test').Worker,
  tabId: number,
  count: number,
): Promise<Array<{ action?: string; selector?: string; unique?: boolean }>> {
  const read = async (): Promise<Array<{ action?: string; selector?: string; unique?: boolean }>> => {
    const steps = await worker.evaluate(async (id) => {
      const items = await chrome.storage.session.get('gf_recording');
      const raw = items['gf_recording'] as
        | { steps?: Record<string, unknown[]> }
        | undefined;
      return (raw?.steps?.[String(id)] ?? []) as unknown[];
    }, tabId);
    return steps as Array<{ action?: string; selector?: string; unique?: boolean }>;
  };

  await expect.poll(async () => (await read()).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(count);
  return read();
}
