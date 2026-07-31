import { test, expect } from '@playwright/test';

/**
 * SPA route-change handling — the last of the audit's P0s.
 *
 * A grep for popstate, pushState, hashchange, the Navigation API or any router
 * integration across the monorepo used to return zero hits. The engine resolved
 * each step's target once with querySelector, waited 150 ms and rendered — so a
 * step whose target lived on another route resolved to null and rendered as a
 * centred modal with no spotlight, silently.
 *
 * These are the only tests that can prove the fix. The fixture drives a real
 * `history.pushState` router, and everything here depends on the built-in
 * history watcher actually observing it — which happy-dom cannot exercise.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('Cross-route tours', () => {
  test('waits on the wrong route rather than rendering an unanchored modal', async ({ page }) => {
    await page.click('#start-routed-btn');
    await expect(page.locator('.gf-popover')).toContainText('On Home');

    // Advance into a state whose route the app is not on. The target for that
    // state does not exist yet, and the old engine would have rendered a
    // centred modal here.
    await page.locator('.gf-popover [data-gf-action="next"]').click();

    await expect
      .poll(() => page.evaluate(() => window.__gfWaiting))
      .toContain('r2:route');

    // The machine has moved to r2, but the popover still shows r1's content —
    // deliberately. setWaiting() marks it busy WITHOUT unmounting, and the new
    // step is not painted until its target resolves. Unmounting would restore
    // focus to the pre-tour element and drop the live region; painting an
    // unanchored r2 is the bug this whole feature exists to fix.
    expect(await page.evaluate(() => window.__guideflow.currentStepId)).toBe('r2');
    await expect(page.locator('.gf-popover')).toContainText('On Home');
    await expect(page.locator('.gf-popover')).toHaveAttribute('aria-busy', 'true');
    expect(await page.evaluate(() => window.__guideflow.isWaiting)).toBe(true);
    expect(await page.evaluate(() => window.__guideflow.isActive)).toBe(true);
    // A wait is not a pause.
    expect(await page.evaluate(() => window.__guideflow.isPaused)).toBe(false);
  });

  test('the page stays clickable while waiting', async ({ page }) => {
    // The critical one. A modal that blocks the navigation it is waiting for
    // can never succeed, so the spotlight goes down for the duration.
    await page.click('#start-routed-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect.poll(() => page.evaluate(() => window.__gfWaiting)).toContain('r2:route');

    // Click the nav link the tour is waiting for — through where the overlay
    // would be.
    await page.click('#go-settings');

    await expect.poll(() => page.evaluate(() => window.__guideflow.isWaiting)).toBe(false);
    await expect(page.locator('[data-gf-spotlight-cutout]')).toBeVisible();
  });

  test('anchors to the target once the route arrives', async ({ page }) => {
    await page.click('#start-routed-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect.poll(() => page.evaluate(() => window.__gfWaiting)).toContain('r2:route');

    await page.click('#go-settings');
    await expect.poll(() => page.evaluate(() => window.__guideflow.isWaiting)).toBe(false);
    await page.waitForTimeout(300);

    const anchored = await page.evaluate(() => {
      const target = document.getElementById('route-settings-target');
      const cutout = document.querySelector('[data-gf-spotlight-cutout]') as HTMLElement | null;
      if (!target || !cutout) return null;
      const t = target.getBoundingClientRect();
      const c = cutout.getBoundingClientRect();
      return { dx: Math.abs(c.x - t.x), dy: Math.abs(c.y - t.y), cw: c.width };
    });

    expect(anchored).not.toBeNull();
    // Inset by the default 8px padding on each side, not adrift in the middle
    // of the viewport — which is what "unanchored modal" looked like.
    expect(anchored!.dx).toBeLessThanOrEqual(12);
    expect(anchored!.dy).toBeLessThanOrEqual(12);
    expect(anchored!.cw).toBeGreaterThan(0);
  });

  test('marks the popover busy without unmounting it', async ({ page }) => {
    await page.click('#start-routed-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();

    // aria-busy, not a teardown — hideStep() would restore focus to the
    // pre-tour element and remove the live region.
    await expect(page.locator('.gf-popover')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);

    await page.click('#go-settings');
    await expect(page.locator('.gf-popover')).toHaveAttribute('aria-busy', 'false');
  });

  test('Escape still works during a wait', async ({ page }) => {
    // isPaused stays false precisely so the keyboard handler stays live —
    // reusing the pause flag would kill Escape when the user most wants out.
    await page.click('#start-routed-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect.poll(() => page.evaluate(() => window.__gfWaiting)).toContain('r2:route');

    await page.keyboard.press('Escape');

    await expect(page.locator('.gf-popover')).toHaveCount(0);
  });

  test('observes a pushState the fixture makes on its own', async ({ page }) => {
    // The built-in watcher patches history cooperatively. This proves the patch
    // is installed and firing, not merely that popstate works.
    await page.click('#start-routed-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect.poll(() => page.evaluate(() => window.__gfWaiting)).toContain('r2:route');

    // No click — call the router directly, which is what a framework does.
    await page.evaluate(() => { window.__gfGo('settings'); });

    await expect.poll(() => page.evaluate(() => window.__guideflow.isWaiting)).toBe(false);
  });

  test('back-navigation across a route boundary works', async ({ page }) => {
    await page.click('#start-routed-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await page.click('#go-settings');
    await expect.poll(() => page.evaluate(() => window.__guideflow.isWaiting)).toBe(false);
    await expect(page.locator('.gf-popover')).toContainText('On Settings');

    // prevStep() already crossed state boundaries via history — putting `route`
    // on the state rather than on a transition is what keeps that working.
    await page.locator('.gf-popover [data-gf-action="prev"]').click();
    await page.evaluate(() => { window.__gfGo('home'); });

    await expect.poll(() => page.evaluate(() => window.__guideflow.currentStepId)).toBe('r1');
  });

  test('patches history only when it has to, and always restores it', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const hasNavigationApi = 'navigation' in window;
      const before = history.pushState;
      window.__guideflow.start(window.__gfFlows['routed']!);
      await new Promise((r) => setTimeout(r, 200));
      const patched = history.pushState !== before;
      window.__guideflow.stop();
      await new Promise((r) => setTimeout(r, 200));
      return { hasNavigationApi, patched, restored: history.pushState === before };
    });

    if (result.hasNavigationApi) {
      // Chromium: `navigatesuccess` tells us everything, so we touch nothing.
      // This branch is the reason the assertion is conditional rather than
      // asserting the patch unconditionally.
      expect(result.patched).toBe(false);
    } else {
      expect(result.patched).toBe(true);
    }
    // Either way the global is exactly as we found it. A library that patches
    // history and never unpatches is a library nobody can debug.
    expect(result.restored).toBe(true);
  });

  test('does not clobber a patch installed on top of ours', async ({ page }) => {
    // Only meaningful where we patch at all — Chromium uses the Navigation API.
    test.skip(
      await page.evaluate(() => 'navigation' in window),
      'Navigation API in use; nothing is patched',
    );
    const result = await page.evaluate(async () => {
      window.__guideflow.start(window.__gfFlows['routed']!);
      await new Promise((r) => setTimeout(r, 200));

      // Somebody else patches after us — a router mounting late.
      const ours = history.pushState;
      let theirCalls = 0;
      const theirs = function (this: History, ...args: unknown[]) {
        theirCalls++;
        return (ours as (...a: unknown[]) => unknown).apply(this, args);
      };
      history.pushState = theirs as typeof history.pushState;

      window.__guideflow.stop();
      await new Promise((r) => setTimeout(r, 200));

      // Ripping ours out would have deleted theirs along with it.
      const stillTheirs = history.pushState === theirs;
      history.pushState('' as never, '', location.href);
      return { stillTheirs, theirCalls };
    });

    expect(result.stillTheirs).toBe(true);
    expect(result.theirCalls).toBeGreaterThan(0);
  });
});

test.describe('Waiting for a target that never arrives', () => {
  test('renders unanchored on timeout rather than skipping or ending', async ({ page }) => {
    await page.click('#start-missing-target-btn');

    await expect.poll(() => page.evaluate(() => window.__gfTimeouts)).toContain('mt1:target');
    // The engine has no timeout policy — it renders and lets userland compose
    // one from the event.
    await expect(page.locator('.gf-popover')).toContainText('Waiting');
    expect(await page.evaluate(() => window.__guideflow.isActive)).toBe(true);
    expect(await page.evaluate(() => window.__gfEnters)).toEqual(['mt1']);
  });

  test('does not leave a black screen behind', async ({ page }) => {
    // A zero-sized cutout keeps its 9999px box-shadow, which paints a fully
    // black click-blocking page.
    await page.click('#start-missing-target-btn');
    await expect.poll(() => page.evaluate(() => window.__gfTimeouts)).toContain('mt1:target');

    const shadow = await page.evaluate(() => {
      const el = document.querySelector('[data-gf-spotlight-cutout]') as HTMLElement | null;
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return { w: box.width, h: box.height, shadow: getComputedStyle(el).boxShadow };
    });

    expect(shadow).not.toBeNull();
    const zeroSized = shadow!.w === 0 && shadow!.h === 0;
    if (zeroSized) expect(shadow!.shadow).toBe('none');
  });
});
