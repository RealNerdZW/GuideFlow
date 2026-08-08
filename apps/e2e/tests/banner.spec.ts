import { test, expect } from '@playwright/test';

/**
 * The docked banner, in a real browser.
 *
 * happy-dom has no layout engine and no `getComputedStyle` worth the name, so
 * the unit tests can only assert structure. Three things are real only here:
 * that the bar does not cover the page (the whole point of it being docked
 * rather than modal), that a running tour's overlay paints over it, and that a
 * url-scoped banner appears on a `pushState` navigation.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

const BASIC = [
  {
    id: 'v2',
    title: 'We shipped v2',
    body: 'Faster exports.',
    actions: [{ label: 'Take a look', variant: 'primary', flowId: 'fixture-tour' }],
  },
];

test.describe('banner', () => {
  test('renders docked, and leaves the page clickable', async ({ page }) => {
    // The first documented limit of the modal announcement: "the overlay blocks
    // the page". A banner that blocked it would be a modal with a different
    // stylesheet.
    await page.evaluate((defs) => window.__gfMountBanners(defs), BASIC);

    const bar = page.locator('.gf-banner');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('We shipped v2');

    // No overlay at all.
    await expect(page.locator('[data-gf-overlay]')).toHaveCount(0);

    // And a control underneath is genuinely reachable, not merely un-dimmed.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
  });

  test('a running tour covers it, and it comes back afterwards', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountBanners(defs), BASIC);
    await expect(page.locator('.gf-banner')).toBeVisible();

    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    // visibility:hidden plus inert. Both, so eye, pointer and keyboard cannot
    // disagree — and z-order below --gf-z-overlay so the dim covers it too.
    await expect(page.locator('.gf-banner')).toBeHidden();
    await expect(page.locator('.gf-banner')).toHaveAttribute('inert', '');

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden();
    await expect(page.locator('.gf-banner')).toBeVisible();
  });

  test('is not a focus trap — Tab leaves it', async ({ page }) => {
    // A persistent docked surface that swallows Tab is a keyboard trap under
    // WCAG 2.1.2. This is the assertion happy-dom cannot make: it reports
    // offsetParent === null for everything and has no tab order.
    await page.evaluate((defs) => window.__gfMountBanners(defs), BASIC);
    await expect(page.locator('.gf-banner')).toBeVisible();

    await page.locator('.gf-banner-action').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const inside = await page.evaluate(
      () => document.querySelector('.gf-banner')?.contains(document.activeElement) ?? false,
    );
    expect(inside).toBe(false);
  });

  test('dismissing reveals the next one, and it stays gone across a reload', async ({ page }) => {
    await page.evaluate(
      (defs) => window.__gfMountBanners(defs),
      [
        { id: 'first', title: 'First up', targeting: { priority: 10 } },
        { id: 'second', title: 'Second in line' },
      ],
    );
    await expect(page.locator('.gf-banner')).toContainText('First up');

    await page.locator('.gf-banner-dismiss').click();
    await expect(page.locator('.gf-banner')).toContainText('Second in line');

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    await page.evaluate(
      (defs) => window.__gfMountBanners(defs),
      [
        { id: 'first', title: 'First up', targeting: { priority: 10 } },
        { id: 'second', title: 'Second in line' },
      ],
    );
    await expect(page.locator('.gf-banner')).toContainText('Second in line');
  });

  test('a url-scoped banner appears on a pushState navigation', async ({ page }) => {
    await page.evaluate(
      (defs) => window.__gfMountBanners(defs),
      [{ id: 'settings-only', title: 'Settings tip', targeting: { urlPattern: '**view=settings*' } }],
    );
    await expect(page.locator('.gf-banner')).toHaveCount(0);

    // A real pushState, through the fixture's ten-line router.
    await page.evaluate(() => window.__gfGo('settings'));
    await expect(page.locator('.gf-banner')).toContainText('Settings tip');

    await page.evaluate(() => window.__gfGo('home'));
    await expect(page.locator('.gf-banner')).toHaveCount(0);
  });

  test('an action starts a tour, and nothing is abandoned', async ({ page }) => {
    // The real user path: no tour running, the reader clicks the CTA. It must
    // produce a clean `tour:start` with no `tour:abandon` anywhere near it,
    // because a banner is not supposed to interrupt anything.
    await page.evaluate((defs) => window.__gfMountBanners(defs), BASIC);
    await expect(page.locator('.gf-banner')).toBeVisible();
    await page.evaluate(() => { window.__gfEvents = []; });

    await page.locator('.gf-banner-action').click();

    await expect(page.locator('.gf-popover')).toBeVisible();
    const events = await page.evaluate(() => window.__gfEvents);
    expect(events).toContain('tour:start');
    expect(events).not.toContain('tour:abandon');
  });

  test('the action is unreachable while a tour is running', async ({ page }) => {
    // The converse, and the reason the unit suite cannot prove it: `inert` and
    // `visibility: hidden` are real only in a browser. A normal click must not
    // reach the button — Playwright's actionability check is exactly the
    // question a user's pointer asks.
    await page.evaluate((defs) => window.__gfMountBanners(defs), BASIC);
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await expect(page.locator('.gf-banner-action')).toBeHidden();
    await expect(
      page.locator('.gf-banner-action').click({ timeout: 1500 }),
    ).rejects.toThrow();
  });

  test('dock top puts the bar ahead of the page content in DOM order', async ({ page }) => {
    // WCAG 1.3.2 Meaningful Sequence.
    await page.evaluate((defs) => window.__gfMountBanners(defs, { dock: 'top' }), BASIC);
    await expect(page.locator('.gf-banner')).toBeVisible();

    const isFirst = await page.evaluate(
      () => document.body.firstElementChild?.classList.contains('gf-banner') ?? false,
    );
    expect(isFirst).toBe(true);
  });
});
