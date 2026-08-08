import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

/**
 * Everything happy-dom cannot prove.
 *
 * The unit suite covers structure and ARIA attributes, but happy-dom has no
 * layout engine — `offsetParent` is null for every element, `getComputedStyle`
 * and `getBoundingClientRect` return zeros, and `inert` is not implemented. Tab
 * order, focus restoration, docked geometry, RTL mirroring, computed
 * reduced-motion styles and z-order hit-testing are only real here.
 *
 * Not verifiable at all: `forced-colors: active` is not emulable in Playwright,
 * so that block is reviewed rather than tested. And no manual screen-reader
 * pass has ever been run on this repo — see apps/docs/guide/accessibility.md.
 */

const ROOT = '.gf-checklist';

/**
 * Is focus currently inside the widget?
 *
 * Two traps, both hit while writing this:
 *
 * 1. `document.activeElement` can be `null`, and `null?.closest()` yields
 *    `undefined` — which is not `null`, so the naive predicate reports
 *    "inside" for no focus at all.
 * 2. **Firefox does not reset `activeElement` when the document loses focus.**
 *    Tabbing out of the last control in the page moves focus to browser
 *    chrome, and Firefox leaves `activeElement` pointing at the control it
 *    just left — so the widget looks like a keyboard trap when it is not.
 *    `document.hasFocus()` is the discriminator.
 */
const FOCUS_INSIDE = (root: string): boolean => {
  if (!document.hasFocus()) return false;
  const el = document.activeElement;
  return el != null && el.closest(root) !== null;
};
const PANEL = '.gf-checklist-panel';
const LAUNCHER = '.gf-checklist-launcher';

test.beforeEach(async ({ page }) => {
  // 'index.html', not '/' — a leading slash discards baseURL's path.
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

/** Click Next until the tour ends. `fixture-tour` is three steps. */
async function finishTour(page: import('@playwright/test').Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await page.locator('.gf-popover [data-gf-action="next"]').click();
  }
  await expect(page.locator('.gf-popover')).toHaveCount(0);
}

async function mount(page: import('@playwright/test').Page): Promise<void> {
  await page.click('#mount-checklist-btn');
  await page.waitForFunction(() => window.__gfChecklistReady === true);
  await expect(page.locator(ROOT)).toBeVisible();
}

test.describe('Checklist widget', () => {
  test('the open panel has no critical or serious violations', async ({ page }) => {
    await mount(page);

    const results = await new AxeBuilder({ page })
      .include(ROOT)
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('focus can leave the widget — it is a disclosure, not a trap', async ({ page }) => {
    // The trap-that-must-not-exist test. A persistent docked surface that
    // swallows Tab is a keyboard trap under WCAG 2.1.2.
    //
    // Both directions are checked from the boundary rather than by tabbing a
    // fixed number of times: how many presses it takes to walk out depends on
    // how many controls the panel happens to have, and on where each browser
    // hands focus to its own chrome.
    await mount(page);

    // Every row is reachable, in DOM order.
    await page.locator(LAUNCHER).focus();
    const reached: string[] = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const id = await page.evaluate(() =>
        document.activeElement?.closest('[data-item-id]')?.getAttribute('data-item-id') ?? '',
      );
      if (id) reached.push(id);
    }
    expect(reached).toEqual(['tour', 'data', 'billing']);

    // Focus leaves at the boundary, and nothing pulls it back — which is what
    // a trap actually looks like. Core's own popover trap is registered on
    // `document` in capture phase and yanks focus back whenever it has left;
    // this widget must do nothing of the kind.
    await page.locator(LAUNCHER).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(FOCUS_INSIDE, ROOT)).toBe(false);

    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await page.evaluate(FOCUS_INSIDE, ROOT)).toBe(false);
    }

    // Only the backward direction is asserted, deliberately. The widget is
    // portalled to the end of <body>, so tabbing forward out of its last
    // control hands focus to browser chrome — which headless Firefox does not
    // have, so the press is a no-op and focus sticks. That is an environment
    // limit, not a product one, and asserting it would pin the harness rather
    // than the widget.
  });

  test('a blocked row is reachable by Tab and starts nothing', async ({ page }) => {
    await mount(page);
    const blocked = page.locator('[data-item-id="billing"] button');

    await expect(blocked).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled, never `disabled` — it must stay focusable to announce
    // which item unblocks it.
    await expect(blocked).not.toHaveAttribute('disabled', /.*/);
    await blocked.focus();
    await expect(blocked).toBeFocused();

    // force: true — Playwright's actionability check refuses to click an
    // aria-disabled element, and "clicking it does nothing" is the assertion.
    await blocked.click({ force: true });
    await expect(page.locator('.gf-popover')).toHaveCount(0);
  });

  test('the widget is hidden, inert and unreachable during a tour', async ({ page }) => {
    await mount(page);
    await page.locator('[data-item-id="tour"] button').click();
    await expect(page.locator('.gf-popover')).toBeVisible();

    const root = page.locator(ROOT);
    await expect(root).toHaveAttribute('inert', /.*/);
    expect(await root.evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');

    // Tab never lands inside it.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(FOCUS_INSIDE, ROOT)).toBe(false);
  });

  test('the overlay covers the checklist, not the other way round', async ({ page }) => {
    // z-index is deliberately BELOW --gf-z-overlay: a running tour must dim and
    // block the widget. 999999 would tie with .gf-popover and resolve by DOM
    // order, silently voiding the overlay's modality promise.
    await mount(page);
    const box = await page.locator(ROOT).boundingBox();
    expect(box).not.toBeNull();

    await page.locator('[data-item-id="tour"] button').click();
    await expect(page.locator('.gf-popover')).toBeVisible();

    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.className ?? '',
      { x: (box?.x ?? 0) + 4, y: (box?.y ?? 0) + 4 },
    );
    expect(String(hit)).not.toContain('gf-checklist');
  });

  test('focus returns to the row that launched the tour', async ({ page }) => {
    await mount(page);
    const control = page.locator('[data-item-id="tour"] button');
    // Explicit focus before Enter: WebKit does not focus a button on mousedown.
    await control.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await finishTour(page);

    // Core restores to whatever was focused before the tour, but only if it is
    // still connected — and that button is gone once the row is done. The <li>
    // survives because the list is patched in place.
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.closest('[data-item-id]')?.getAttribute('data-item-id')),
      )
      .toBe('tour');
  });

  test('the announcement lands in its own region, outside the panel', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => window.__gfChecklist?.complete('data'));

    const region = page.locator('[id^="gf-checklist-live"]');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toHaveText(/Connect your data, completed\. 1 of 3 complete/);

    // Its own element, so the two surfaces never clobber each other.
    expect(await region.evaluate((el) => el.closest('.gf-checklist-panel') === null)).toBe(true);
    // Visually hidden but NOT removed from the accessibility tree.
    const styles = await region.evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, visibility: s.visibility };
    });
    expect(styles.display).not.toBe('none');
    expect(styles.visibility).not.toBe('hidden');
  });

  test('both live regions coexist through a tour completion', async ({ page }) => {
    await mount(page);
    await page.locator('[data-item-id="tour"] button').click();
    await expect(page.locator('.gf-popover')).toBeVisible();

    // The renderer's region carries no class and no id, so it is identified by
    // NOT being ours. Two regions on the page at once is the point.
    await expect(page.locator('[role="status"]:not([id^="gf-checklist-live"])')).toHaveCount(1);
    await expect(page.locator('[id^="gf-checklist-live"]')).toHaveCount(0);

    await finishTour(page);

    // The checklist's announcement was held until the tour was gone.
    await expect(page.locator('[id^="gf-checklist-live"]')).toHaveText(/Take the tour, completed/);
  });

  test('never renders a stale count with a pre-seeded record', async ({ page }) => {
    // The widget paints nothing until the first storage read resolves, so
    // "0 of 3" must never appear on the way to "1 of 3".
    await page.evaluate(() => {
      localStorage.setItem(
        'gf:e2e-user:progress:checklist',
        JSON.stringify({
          value: { v: 1, lists: { 'e2e-getting-started': { ver: 1, done: { data: 1 }, t: 1 } } },
          expiresAt: Number.MAX_SAFE_INTEGER,
        }),
      );
    });

    const seen: string[] = [];
    await page.click('#mount-checklist-btn');
    for (let i = 0; i < 25; i++) {
      const text = await page.locator('[role="progressbar"]').getAttribute('aria-valuetext').catch(() => null);
      if (text) seen.push(text);
      await page.waitForTimeout(10);
    }

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain('0 of 3 complete');
  });

  test('honours prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mount(page);

    const transition = await page
      .locator(PANEL)
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transition.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
  });

  test('mirrors under dir=rtl with no [dir=rtl] rules', async ({ page }) => {
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await mount(page);

    const box = await page.locator(ROOT).boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    // inset-inline-end plus flexbox: the browser does the mirroring, and there
    // is no JS and no [dir="rtl"] rule involved.
    expect(box?.x ?? width).toBeLessThan(width / 2);
  });

  test('reflects a completed tour without the app writing anything', async ({ page }) => {
    await mount(page);
    await expect(page.locator('[data-item-id="tour"]')).not.toHaveAttribute('data-gf-done', /.*/);

    await page.locator('[data-item-id="tour"] button').click();
    await finishTour(page);

    // A projection of ProgressStore's completed-flows array, not a copy of it.
    await expect(page.locator('[data-item-id="tour"]')).toHaveAttribute('data-gf-done', /.*/);
    await expect(page.locator('[role="progressbar"]')).toHaveAttribute(
      'aria-valuetext',
      '1 of 3 complete',
    );
  });

  test('survives a reload', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => window.__gfChecklist?.complete('data'));
    await expect(page.locator('[data-item-id="data"]')).toHaveAttribute('data-gf-done', /.*/);

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    await mount(page);

    await expect(page.locator('[data-item-id="data"]')).toHaveAttribute('data-gf-done', /.*/);
    await expect(page.locator('[data-item-id="billing"] button')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

test.describe('Modal announcement', () => {
  // A single-step flow with `target: null` — the shipped recipe for an
  // announcement, documented at apps/docs/guide/announcements.md.
  test('renders centred, modal, with no progress bar and no counter', async ({ page }) => {
    await page.evaluate(() => {
      void window.__guideflow?.start({
        id: 'announcement',
        initial: 'main',
        states: {
          main: {
            final: true,
            steps: [
              { id: 'only', target: null, content: { title: 'We shipped v2', body: 'Take a look.' } },
            ],
          },
        },
      });
    });

    const popover = page.locator('.gf-popover');
    await expect(popover).toBeVisible();
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(popover).toHaveAttribute('aria-modal', 'true');

    // One step: nothing to count, nothing to fill. Both are gated on
    // `total > 1` in the renderer, which is what makes this recipe read as an
    // announcement rather than a truncated tour.
    await expect(popover.locator('.gf-progress-bar')).toHaveCount(0);
    await expect(popover.locator('.gf-popover-step-info')).toHaveCount(0);

    // Polled: the popover animates in, so a single read can land mid-transform.
    await expect
      .poll(async () => {
        const box = await popover.boundingBox();
        const viewport = page.viewportSize();
        const centreX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
        return Math.abs(centreX - (viewport?.width ?? 0) / 2);
      })
      .toBeLessThan(4);
  });
});
