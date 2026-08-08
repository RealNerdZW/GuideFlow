import { test, expect } from '@playwright/test';

/**
 * `?gf_tour=` against a real address bar.
 *
 * The stripping half of this feature cannot be tested anywhere else: happy-dom's
 * `history.replaceState` does not move `window.location.href` at all — measured,
 * and the same limitation the routing specs already work around for
 * `pushState`. A unit test can only assert that `replaceState` was *called*.
 *
 * Everything here loads the page with the query already present, exactly as a
 * recipient clicking a support link would.
 */

/**
 * Load the page with the link already in the address bar, as a recipient would.
 *
 * `clear` defaults to true. The replay tests pass `false` — clearing storage
 * between the two visits would delete the very completion record they exist to
 * step over, and the test would pass without the feature working.
 */
const ready = async (
  page: import('@playwright/test').Page,
  query: string,
  clear = true,
): Promise<void> => {
  await page.goto(`index.html${query}`);
  await page.waitForFunction(() => window.__gfReady === true);
  if (clear) await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => window.__gfInstallTargeting());
};

/** The strip happens after `start()` resolves, so the URL settles a tick later. */
const strippedOf = async (
  page: import('@playwright/test').Page,
  param: string,
): Promise<void> => {
  await expect
    .poll(() => new URL(page.url()).searchParams.get(param))
    .toBeNull();
};

test.describe('deep links', () => {
  test('a link starts the tour it names', async ({ page }) => {
    await ready(page, '?gf_tour=fixture-deeplink');

    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('.gf-popover')).toContainText('Linked one');
  });

  test('a link can name a step', async ({ page }) => {
    await ready(page, '?gf_tour=fixture-deeplink&gf_tour_step=dl2');

    await expect(page.locator('.gf-popover')).toContainText('Linked two');
  });

  test('the parameters are removed, and nothing else is', async ({ page }) => {
    await ready(page, '?utm_source=zendesk&gf_tour=fixture-deeplink&gf_tour_step=dl2&tab=x');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await strippedOf(page, 'gf_tour');
    await strippedOf(page, 'gf_tour_step');

    // A support link carries UTM tags and the app's own state. Eating those
    // would be a real regression, and it is only visible with a real URL.
    const url = new URL(page.url());
    expect(url.searchParams.get('utm_source')).toBe('zendesk');
    expect(url.searchParams.get('tab')).toBe('x');
  });

  test('stripping adds no history entry, so Back still leaves the page', async ({ page }) => {
    // `replaceState`, never `pushState`. A pushed entry would make the back
    // button undo the strip and re-trigger the tour.
    await page.goto('index.html');
    await page.waitForFunction(() => window.__gfReady === true);

    await ready(page, '?gf_tour=fixture-deeplink');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await strippedOf(page, 'gf_tour');

    await page.goBack();
    expect(new URL(page.url()).searchParams.get('gf_tour')).toBeNull();
  });

  test('refuses a flow that did not opt in', async ({ page }) => {
    // The security boundary, in a real browser: a crafted link chooses which of
    // the host's tours runs, so anything not marked `deepLink` must stay shut.
    await ready(page, '?gf_tour=fixture-not-linked');

    await expect(page.locator('.gf-popover')).toBeHidden();
    // ...and the URL is left alone, so nothing pretends to have handled it.
    expect(new URL(page.url()).searchParams.get('gf_tour')).toBe('fixture-not-linked');
  });

  test('refuses an id that names nothing', async ({ page }) => {
    await ready(page, '?gf_tour=does-not-exist');
    await expect(page.locator('.gf-popover')).toBeHidden();
  });

  test('replays a tour the user already completed', async ({ page }) => {
    // The whole point. `start()` refuses a completed tour silently — no render,
    // no event — so without `force` a support link does nothing for exactly the
    // people it gets sent to.
    await ready(page, '?gf_tour=fixture-deeplink');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('[data-gf-action="next"]');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toBeHidden();

    await ready(page, '?gf_tour=fixture-deeplink', false);
    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('.gf-popover')).toContainText('Linked one');
  });

  test('replaying does not clear the completion record', async ({ page }) => {
    // `force` writes nothing. Clearing instead would un-tick @guideflow/checklist,
    // which projects getCompletedFlows() — a URL must not destroy progress the
    // user earned.
    await ready(page, '?gf_tour=fixture-deeplink');
    await page.click('[data-gf-action="next"]');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toBeHidden();

    const before = await page.evaluate(() =>
      window.__guideflow.progress.getCompletedFlows('e2e-user'));
    expect(before).toContain('fixture-deeplink');

    await ready(page, '?gf_tour=fixture-deeplink', false);
    await expect(page.locator('.gf-popover')).toBeVisible();

    const after = await page.evaluate(() =>
      window.__guideflow.progress.getCompletedFlows('e2e-user'));
    expect(after).toContain('fixture-deeplink');
  });
});
