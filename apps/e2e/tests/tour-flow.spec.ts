import { test, expect } from '@playwright/test';

/**
 * Tour navigation against the real built bundle in a real browser.
 *
 * `window.__gfEnters` is a fixture hook recording every `step:enter` in order,
 * so these specs assert on the sequence actually rendered rather than only on
 * what happens to be visible at the end.
 */

test.beforeEach(async ({ page }) => {
  // 'index.html', not '/'. Playwright resolves a goto() argument with
  // `new URL(url, baseURL)`, and a leading slash discards baseURL's path —
  // '/' landed on the repo root the static server exposes, where nothing ever
  // sets __gfReady. Every spec in this suite then timed out in beforeEach.
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  // Persisted progress from a previous spec would suppress or resume a tour.
  await page.evaluate(() => localStorage.clear());
});

test.describe('Tour flow', () => {
  test('start button opens the first step', async ({ page }) => {
    await page.click('#start-btn');

    const popover = page.locator('.gf-popover');
    await expect(popover).toBeVisible();
    await expect(popover).toContainText('Step One');
  });

  test('navigates forward through every step, then completes', async ({ page }) => {
    await page.click('#start-btn');

    await expect(page.locator('.gf-popover')).toContainText('Step One');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Step Two');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Step Three');

    // The last step's primary button reads "Done" but still dispatches `next`:
    // `end` maps to stop(), which reports the tour as abandoned rather than
    // completed. Regression for `done-button-abandons-tour`.
    await expect(page.locator('.gf-popover .gf-btn-primary')).toHaveText('Done');
    await page.click('.gf-popover .gf-btn-primary');
    await expect(page.locator('.gf-popover')).toBeHidden();

    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['s1', 's2', 's3']);
    expect(await page.evaluate(() => window.__gfEvents)).toContain('tour:complete');
  });

  test('navigates backward', async ({ page }) => {
    await page.click('#start-btn');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Step Two');

    await page.click('[data-gf-action="prev"]');
    await expect(page.locator('.gf-popover')).toContainText('Step One');
  });

  test('Back on the first step is a no-op, not a re-render', async ({ page }) => {
    // Regression: prev() at index 0 used to re-emit step:enter for the step
    // already on screen, double-counting it in analytics.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toContainText('Step One');

    // The first step renders no Back button at all; drive the engine directly.
    await page.evaluate(() => window.__guideflow.prev());
    await expect(page.locator('.gf-popover')).toContainText('Step One');

    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['s1']);
  });

  test('close button ends the tour', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('.gf-popover-close');
    await expect(page.locator('.gf-popover')).toBeHidden();
  });

  test('Escape ends the tour', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden();
  });

  test('ArrowRight and ArrowLeft navigate', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toContainText('Step One');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.gf-popover')).toContainText('Step Two');

    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.gf-popover')).toContainText('Step One');
  });
});

test.describe('Final-state steps', () => {
  test('renders every step of a final state', async ({ page }) => {
    // Regression for `final-state-steps-never-rendered`: the engine used to
    // check isFinal immediately after transitioning, so entering a state marked
    // final ended the tour before its steps were shown. This flow mirrors the
    // README quick-start, which displayed 1 of its 2 steps.
    await page.click('#start-final-btn');

    await expect(page.locator('.gf-popover')).toContainText('Welcome!');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Your profile');

    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['f1', 'f2']);
  });

  test('reports 2 total steps, not 1', async ({ page }) => {
    await page.click('#start-final-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    expect(await page.evaluate(() => window.__guideflow.totalSteps)).toBe(2);
    await expect(page.locator('.gf-popover-step-info')).toContainText('1');
  });
});

test.describe('Cross-state navigation', () => {
  test('Back crosses a state boundary', async ({ page }) => {
    // Regression for `fsm-navigation-cannot-cross-states`: prev() was
    // intra-state only and failed silently at a state boundary.
    await page.click('#start-multistate-btn');
    await expect(page.locator('.gf-popover')).toContainText('State One');

    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('State Two');

    await page.click('[data-gf-action="prev"]');
    await expect(page.locator('.gf-popover')).toContainText('State One');

    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['m1', 'm2', 'm1']);
  });

  test('goTo() reaches a step in another state', async ({ page }) => {
    await page.click('#start-multistate-btn');
    await expect(page.locator('.gf-popover')).toContainText('State One');

    await page.evaluate(() => window.__guideflow.goTo('m2'));
    await expect(page.locator('.gf-popover')).toContainText('State Two');
    expect(await page.evaluate(() => window.__guideflow.currentStepId)).toBe('m2');
  });
});

test.describe('Keyboard does not hijack text entry', () => {
  test('arrow keys inside an input do not advance the tour', async ({ page }) => {
    // Regression for `arrow-keys-break-inputs`: the document-level handler
    // preventDefault'ed arrow keys with no check for editable targets, so a
    // user could not move the caret while a tour was active.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toContainText('Step One');

    const input = page.locator('#text-input');
    await input.fill('hello');
    await input.press('ArrowLeft');

    await expect(page.locator('.gf-popover')).toContainText('Step One');
    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['s1']);

    // And the caret really moved: typing lands before the final character.
    await input.type('X');
    await expect(input).toHaveValue('hellXo');
  });
});
