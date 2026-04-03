import { test, expect } from '@playwright/test';

/**
 * Tour flow E2E tests.
 * These run against the Storybook dev server at http://localhost:5173
 * (or the fixture HTML page for vanilla JS tests).
 */

test.describe('Tour flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for GuideFlow to be ready
    await page.waitForFunction(() => typeof window.__guideflow !== 'undefined', { timeout: 10_000 }).catch(() => {});
  });

  test('start button triggers tour', async ({ page }) => {
    const startBtn = page.locator('#start-btn');
    await startBtn.click();

    // Popover should appear
    const popover = page.locator('.gf-popover');
    await expect(popover).toBeVisible({ timeout: 5000 });
    await expect(popover).toContainText('Step One');
  });

  test('can navigate forward through all steps', async ({ page }) => {
    await page.click('#start-btn');

    for (let i = 1; i <= 3; i++) {
      const popover = page.locator('.gf-popover');
      await expect(popover).toBeVisible();

      if (i < 3) {
        await page.click('[data-gf-action="next"]');
      }
    }

    // After last step next click ends tour
    await page.click('[data-gf-action="next"]');
    const popover = page.locator('.gf-popover');
    await expect(popover).toBeHidden({ timeout: 3000 });
  });

  test('can navigate backward', async ({ page }) => {
    await page.click('#start-btn');

    // Go to step 2
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Step Two');

    // Go back to step 1
    await page.click('[data-gf-action="prev"]');
    await expect(page.locator('.gf-popover')).toContainText('Step One');
  });

  test('dismiss button ends tour', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('.gf-popover-close');
    await expect(page.locator('.gf-popover')).toBeHidden({ timeout: 3000 });
  });

  test('Escape key dismisses tour', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden({ timeout: 3000 });
  });

  test('Arrow Right navigates forward', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toContainText('Step One');

    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.gf-popover')).toContainText('Step Two');
  });
});
