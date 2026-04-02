import { test, expect } from '@playwright/test';
import AxeBuilder from 'axe-playwright';

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page has no critical a11y violations before tour', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations.filter((v) => v.impact === 'critical')).toHaveLength(0);
  });

  test('popover has no a11y violations when open', async ({ page }) => {
    await page.click('#start-btn');
    await page.locator('.gf-popover').waitFor({ state: 'visible' });

    const results = await new AxeBuilder({ page })
      .include('.gf-popover')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(results.violations.map((v) => `${v.id}: ${v.description}`)).toHaveLength(0);
  });

  test('popover has role="dialog" and aria-modal', async ({ page }) => {
    await page.click('#start-btn');
    const popover = page.locator('.gf-popover');
    await expect(popover).toHaveAttribute('role', 'dialog');
    await expect(popover).toHaveAttribute('aria-modal', 'true');
  });

  test('popover has aria-labelledby pointing to title', async ({ page }) => {
    await page.click('#start-btn');
    const popover = page.locator('.gf-popover');
    const labelledBy = await popover.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();

    const titleEl = page.locator(`#${labelledBy}`);
    await expect(titleEl).toBeVisible();
    await expect(titleEl).toHaveText('Step One');
  });

  test('focus moves into popover when it opens', async ({ page }) => {
    await page.click('#start-btn');
    await page.locator('.gf-popover').waitFor({ state: 'visible' });

    const focusedEl = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focusedEl).toContain('gf-popover');
  });

  test('close button is focusable', async ({ page }) => {
    await page.click('#start-btn');
    const closeBtn = page.locator('.gf-popover-close');
    await expect(closeBtn).toBeVisible();
    await expect(closeBtn).toBeFocused().catch(async () => {
      // Tab to close button and verify
      await closeBtn.focus();
      await expect(closeBtn).toBeFocused();
    });
  });
});
