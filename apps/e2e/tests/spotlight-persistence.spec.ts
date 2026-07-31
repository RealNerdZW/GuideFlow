import { test, expect } from '@playwright/test';

/**
 * Geometry and persistence. Everything here was structurally invisible to the
 * unit suite: happy-dom has no layout engine, so getBoundingClientRect() always
 * returns zeros and two of the audit's P0s were geometry bugs.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('Spotlight overlay', () => {
  test('appears when a tour starts', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('[data-gf-spotlight-cutout]')).toBeVisible();
  });

  test('cutout covers the target element', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const target = await page.locator('#step-one').boundingBox();
    const cutout = await page.locator('[data-gf-spotlight-cutout]').boundingBox();
    expect(target).not.toBeNull();
    expect(cutout).not.toBeNull();

    // The cutout is inset by the configured padding (default 8px) on each side.
    expect(Math.abs(cutout!.x - target!.x)).toBeLessThanOrEqual(12);
    expect(Math.abs(cutout!.y - target!.y)).toBeLessThanOrEqual(12);
    expect(cutout!.width).toBeGreaterThanOrEqual(target!.width);
    expect(cutout!.height).toBeGreaterThanOrEqual(target!.height);
  });

  test('tracks the target through a scroll', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.mouse.wheel(0, 400);
    // Let the scroll listener and any transition settle.
    await page.waitForTimeout(400);

    const target = await page.locator('#step-one').boundingBox();
    const cutout = await page.locator('[data-gf-spotlight-cutout]').boundingBox();
    expect(Math.abs(cutout!.y - target!.y)).toBeLessThanOrEqual(12);
  });

  test('disappears when the tour ends', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('[data-gf-spotlight-cutout]')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-gf-spotlight-cutout]')).toBeHidden();
  });
});

test.describe('Popover positioning', () => {
  test('anchors to a target far below the fold', async ({ page }) => {
    // Regression for `popover-viewport-coordinate-mismatch`: getViewportRect()
    // returned page coordinates while target rects are client-relative, so every
    // fit test failed once the page scrolled and the popover collapsed to a
    // clamped centre. #far-target sits ~1600px down.
    await page.click('#start-scroll-btn');
    await expect(page.locator('.gf-popover')).toContainText('Far Step');
    await page.waitForTimeout(400);

    const target = await page.locator('#far-target').boundingBox();
    const popover = await page.locator('.gf-popover').boundingBox();
    expect(target).not.toBeNull();
    expect(popover).not.toBeNull();

    // placement: 'bottom' — the popover sits just below the target, not adrift
    // in the middle of the viewport.
    const gap = popover!.y - (target!.y + target!.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(40);

    // Horizontally centred on the target.
    const targetCentre = target!.x + target!.width / 2;
    const popoverCentre = popover!.x + popover!.width / 2;
    expect(Math.abs(popoverCentre - targetCentre)).toBeLessThan(60);
  });

  test('stays inside the viewport', async ({ page }) => {
    await page.click('#start-scroll-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await page.waitForTimeout(400);

    const popover = (await page.locator('.gf-popover').boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(popover.x).toBeGreaterThanOrEqual(-1);
    expect(popover.y).toBeGreaterThanOrEqual(-1);
    expect(popover.x + popover.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test('follows the target when the page scrolls', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const before = (await page.locator('.gf-popover').boundingBox())!;
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(400);
    const after = (await page.locator('.gf-popover').boundingBox())!;

    // The popover must move with the target, not stay pinned to the viewport.
    expect(Math.abs(after.y - before.y)).toBeGreaterThan(100);

    const target = (await page.locator('#step-one').boundingBox())!;
    expect(after.y).toBeGreaterThan(target.y);
  });
});

test.describe('Persistence', () => {
  test('writes progress as soon as a tour starts', async ({ page }) => {
    // Regression for `progress-not-saved-on-start-or-abandon`: progress was
    // only written by next/prev/goTo/send, so a user who left on step 1 had
    // nothing saved.
    await page.click('#start-persisted-btn');
    await expect(page.locator('.gf-popover')).toContainText('Persisted One');

    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith('gf:')),
    );
    expect(keys.length).toBeGreaterThan(0);
  });

  test('resumes on the step the user left on', async ({ page }) => {
    // Regression for `resume-renders-step-zero`: the resume path restored FSM
    // state but never re-rendered, so the UI stayed on step 0 while
    // currentStepId reported the restored position.
    await page.click('#start-persisted-btn');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Persisted Two');

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    await page.click('#start-persisted-btn');

    await expect(page.locator('.gf-popover')).toContainText('Persisted Two');
    expect(await page.evaluate(() => window.__guideflow.currentStepId)).toBe('p2');
  });

  test('a completed tour does not replay', async ({ page }) => {
    // Regression for `completed-tours-replay-forever`: start() never consulted
    // isCompleted, so a finished tour restarted on every page load.
    await page.click('#start-persisted-btn');
    await page.click('[data-gf-action="next"]');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Persisted Three');
    await page.click('[data-gf-action="end"]');
    await expect(page.locator('.gf-popover')).toBeHidden();

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    await page.click('#start-persisted-btn');

    await expect(page.locator('.gf-popover')).toBeHidden();
    expect(await page.evaluate(() => window.__gfEnters)).toEqual([]);
  });
});
