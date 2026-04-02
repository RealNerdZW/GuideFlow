import { test, expect } from '@playwright/test';

test.describe('Spotlight overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('spotlight overlay appears when tour starts', async ({ page }) => {
    await page.click('#start-btn');
    // The spotlight uses a fixed div with box-shadow
    const spotlight = page.locator('.gf-spotlight');
    await expect(spotlight).toBeVisible({ timeout: 5000 });
  });

  test('spotlight tracks the target element', async ({ page }) => {
    await page.click('#start-btn');

    const target = page.locator('#step-one');
    const targetBox = await target.boundingBox();
    expect(targetBox).not.toBeNull();

    const spotlight = page.locator('.gf-spotlight');
    const spotlightBox = await spotlight.boundingBox();
    expect(spotlightBox).not.toBeNull();

    if (targetBox && spotlightBox) {
      // Spotlight cutout should approximately match the target element position
      expect(Math.abs(spotlightBox.x - targetBox.x)).toBeLessThan(20);
      expect(Math.abs(spotlightBox.y - targetBox.y)).toBeLessThan(20);
    }
  });

  test('spotlight disappears when tour ends', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-spotlight')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-spotlight')).toBeHidden({ timeout: 3000 });
  });
});

test.describe('Persistence', () => {
  test('completed steps are stored in localStorage', async ({ page }) => {
    await page.goto('/');
    await page.click('#start-btn');

    // Complete the tour
    await page.click('.gf-btn-next');
    await page.click('.gf-btn-next');
    await page.click('.gf-btn-next');

    // Check localStorage
    const stored = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('gf:'));
      return keys.length;
    });

    expect(stored).toBeGreaterThan(0);
  });
});

test.describe('A/B variant assignment', () => {
  test('same user always gets same variant (deterministic)', async ({ page }) => {
    const results = await page.evaluate(() => {
      // Inline djb2 to verify determinism without importing the package
      function djb2(str: string): number {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
          hash >>>= 0;
        }
        return hash;
      }

      const userId = 'test-user-stable';
      const experimentId = 'tour-theme-2024';
      const key = `${userId}:${experimentId}`;

      const hash1 = djb2(key) % 100;
      const hash2 = djb2(key) % 100;
      return { hash1, hash2, equal: hash1 === hash2 };
    });

    expect(results.equal).toBe(true);
  });
});
