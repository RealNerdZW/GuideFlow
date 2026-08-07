import { test, expect } from '@playwright/test';

/**
 * `advanceOn` — the half of `clickThrough` that did not exist until Phase 8.1.
 *
 * ADR-004 spent ~1.3 kB carving a `clip-path` hole so the user can click the
 * spotlit control, and the engine attached exactly one listener — `keydown` on
 * `document` — and nothing on the target. The user clicked, the app responded,
 * and the step waited for Next.
 *
 * This has to live here rather than in the unit suite. happy-dom has no layout
 * engine and no `clip-path` hit-testing, so it cannot tell a carved hole from a
 * solid overlay: a unit test would pass identically whether the click reached
 * the button or was swallowed. Only a real browser can prove both halves —
 * that the click landed on the page AND that the tour noticed.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('advanceOn', () => {
  test('a click on the highlighted control advances the tour', async ({ page }) => {
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('.gf-popover')).toContainText('Step one');

    await page.click('#clickable-target');

    // Both halves, and neither proves the feature on its own: the click reached
    // the page (so the hole is real), and the tour moved (so the helper saw it).
    await expect(page.locator('#click-count')).toHaveText('1');
    await expect(page.locator('.gf-popover')).toContainText('Step two');
    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['av1', 'av2']);
  });

  test('a second click completes the tour', async ({ page }) => {
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('#clickable-target');
    await expect(page.locator('.gf-popover')).toContainText('Step two');

    await page.click('#clickable-target');

    await expect(page.locator('.gf-popover')).toBeHidden();
    await expect(page.locator('#click-count')).toHaveText('2');
    expect(await page.evaluate(() => window.__guideflow.isActive)).toBe(false);
  });

  test('one click advances exactly one step', async ({ page }) => {
    // The one-shot. `next()` moves the machine before its first await, so two
    // handlers firing in one frame would skip two steps.
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('#clickable-target');
    await expect(page.locator('.gf-popover')).toContainText('Step two');

    // Still on step two a moment later, not completed.
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['av1', 'av2']);
  });

  test('a paused tour does not advance', async ({ page }) => {
    // `pause()` emits no `step:exit` AND drops the spotlight, which releases
    // pointer capture — so the whole page becomes clickable at exactly the
    // moment the rule must not fire. Only a `tour:pause` teardown closes this.
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.evaluate(() => { window.__guideflow.pause(); });
    await page.click('#clickable-target');

    await expect(page.locator('#click-count')).toHaveText('1');
    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['av1']);
    expect(await page.evaluate(() => window.__guideflow.isPaused)).toBe(true);
  });

  test('it re-arms after resume', async ({ page }) => {
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.evaluate(() => { window.__guideflow.pause(); });
    await page.evaluate(() => { window.__guideflow.resume(); });
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('#clickable-target');
    await expect(page.locator('.gf-popover')).toContainText('Step two');
  });

  test('the Next button still works — advanceOn is additive', async ({ page }) => {
    // A tour that can only be completed by guessing the right gesture is worse
    // than one with a button, so the button has to stay.
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('[data-gf-action="next"]');

    await expect(page.locator('.gf-popover')).toContainText('Step two');
    // And the click count did NOT move — the tour advanced without the user
    // touching the page's own control.
    await expect(page.locator('#click-count')).toHaveText('0');
  });

  test('a keyboard user can activate the control — but only because it is a real button', async ({ page }) => {
    // Documented limitation, pinned so it cannot regress silently in either
    // direction. The renderer traps focus inside the popover, so Tab does not
    // reach the target; focusing it programmatically is the closest a spec can
    // get to the keyboard path today. Enter on a native <button> synthesises a
    // click, which is why `click` rules work at all for keyboard users who can
    // reach the control.
    await page.click('#start-advance-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.locator('#clickable-target').focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('#click-count')).toHaveText('1');
    await expect(page.locator('.gf-popover')).toContainText('Step two');
  });
});

test.describe('exposeGlobal', () => {
  test('the fixture opts in, so the devtools global is present', async ({ page }) => {
    // The fixture used to hand-assign this. It is a config option now, which
    // means every spec in this suite that reaches through the global is live
    // coverage of `createGuideFlow({ exposeGlobal: true })` in four browsers.
    const exposed = await page.evaluate(() => ({
      present: typeof window.__guideflow !== 'undefined',
      canStart: typeof window.__guideflow?.start === 'function',
      canList: typeof window.__guideflow?.listFlows === 'function',
      canSubscribe: typeof window.__guideflow?.on === 'function',
    }));

    // Not just present — it must be the full instance the extension dispatches
    // to. `Object.assign` builds those wrappers onto the engine, so exposing
    // the pre-assign reference would give the panel an object whose commands
    // mostly no-op.
    expect(exposed).toEqual({ present: true, canStart: true, canList: true, canSubscribe: true });
  });
});
