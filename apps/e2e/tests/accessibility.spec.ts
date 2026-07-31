import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

/**
 * The previous version of this file imported a default `AxeBuilder` from
 * `axe-playwright`, which exports no such thing — that class belongs to
 * `@axe-core/playwright`. The import threw before a single assertion ran.
 *
 * Several checks below are known-failing against the current renderer and are
 * marked `test.fixme` with the audit finding that tracks them. They are kept
 * executable so Phase 6 can remove the marker and watch them pass.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('Accessibility', () => {
  test('the page itself has no critical violations before a tour', async ({ page }) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.map((v) => v.id)).toEqual([]);
  });

  test('the open popover has no critical or serious violations', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('.gf-popover')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('the dialog exposes an accessible name', async ({ page }) => {
    await page.click('#start-btn');
    const dialog = page.locator('.gf-popover');
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = await dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    // Regression for `dangling-aria-labelledby`: the referenced node must exist.
    await expect(page.locator(`#${labelledBy}`)).toHaveCount(1);
    await expect(page.locator(`#${labelledBy}`)).toHaveText('Step One');
  });

  test('focus moves into the popover when a step opens', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const focusInside = await page.evaluate(() => {
      const popover = document.querySelector('.gf-popover');
      return !!popover && popover.contains(document.activeElement);
    });
    expect(focusInside).toBe(true);
  });

  test('tabbing through the controls does not dismiss the tour', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const buttons = await page.locator('.gf-popover button').count();
    expect(buttons).toBeGreaterThan(0);

    for (let i = 0; i < buttons; i++) {
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('.gf-popover')).toBeVisible();
  });

  // ── Known failures, tracked for Phase 6 ───────────────────────────────────

  test.fixme('focus is trapped inside the dialog', async ({ page }) => {
    // AUDIT `no-focus-trap-or-restore`
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');

    const stillInside = await page.evaluate(() => {
      const popover = document.querySelector('.gf-popover');
      return !!popover && popover.contains(document.activeElement);
    });
    expect(stillInside).toBe(true);
  });

  test.fixme('focus returns to the trigger when the tour closes', async ({ page }) => {
    // AUDIT `no-focus-trap-or-restore`
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await page.keyboard.press('Escape');

    const activeId = await page.evaluate(() => document.activeElement?.id);
    expect(activeId).toBe('start-btn');
  });

  test.fixme('step changes are announced to assistive technology', async ({ page }) => {
    // AUDIT `no-live-region`
    await page.click('#start-btn');
    await expect(page.locator('[aria-live]')).toHaveCount(1);
  });

  test.fixme('the progress bar has an accessible name', async ({ page }) => {
    // AUDIT `progressbar-no-name-or-valuetext`
    await page.click('#start-btn');
    await expect(page.locator('[role="progressbar"]')).toHaveAttribute(
      'aria-valuetext',
      /step/i,
    );
  });

  test.fixme('animations respect prefers-reduced-motion', async ({ page }) => {
    // AUDIT `no-reduced-motion-guard`
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const animation = await page.evaluate(() => {
      const el = document.querySelector('.gf-popover');
      return el ? getComputedStyle(el).animationName : null;
    });
    expect(animation).toBe('none');
  });
});
