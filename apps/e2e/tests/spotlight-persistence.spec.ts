import { test, expect } from '@playwright/test';

/**
 * Geometry and persistence. Everything here was structurally invisible to the
 * unit suite: happy-dom has no layout engine, so getBoundingClientRect() always
 * returns zeros and two of the audit's P0s were geometry bugs.
 */

test.beforeEach(async ({ page }) => {
  // 'index.html', not '/'. Playwright resolves a goto() argument with
  // `new URL(url, baseURL)`, and a leading slash discards baseURL's path —
  // '/' landed on the repo root the static server exposes, where nothing ever
  // sets __gfReady. Every spec in this suite then timed out in beforeEach.
  await page.goto('index.html');
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
    // Regression for `popover-drifts-on-scroll`. 150px, not 300: #step-one sits
    // ~166px down, so a 300px scroll puts it *above* the viewport and the
    // popover legitimately falls back to a clamped centre — which would make
    // this assertion measure the fallback rather than the tracking.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const before = (await page.locator('.gf-popover').boundingBox())!;
    const targetBefore = (await page.locator('#step-one').boundingBox())!;

    await page.mouse.wheel(0, 150);
    // Firefox animates a wheel scroll, so a fixed timeout samples mid-flight and
    // the popover trails the target by a few pixels. Wait for scrollY to hold
    // still, then give the scroll listener one more frame to reposition.
    await page.waitForFunction(() => {
      const w = window as unknown as { __lastY?: number }
      const settled = w.__lastY === window.scrollY
      w.__lastY = window.scrollY
      return settled && window.scrollY > 0
    }, undefined, { polling: 100 });
    await page.waitForTimeout(200);

    const after = (await page.locator('.gf-popover').boundingBox())!;
    const targetAfter = (await page.locator('#step-one').boundingBox())!;

    // The popover tracked its target rather than staying pinned to the
    // viewport: both moved by the same amount, within a pixel of rounding.
    const targetDelta = targetAfter.y - targetBefore.y;
    expect(Math.abs(targetDelta)).toBeGreaterThan(100);
    // ±2px: the positioner rounds to whole pixels and the target's own box is
    // fractional, so the two deltas agree to about a pixel, not exactly.
    expect(Math.abs((after.y - before.y) - targetDelta)).toBeLessThanOrEqual(2);
    // And it is still below its target, as `placement: 'bottom'` asks.
    expect(after.y).toBeGreaterThan(targetAfter.y);
  });

  test('falls back to a clamped centre when the target scrolls out of view', async ({ page }) => {
    // Not a bug — the alternative is a popover that flies off-screen with its
    // target and strands the user with no way to advance or dismiss the tour.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);

    const target = (await page.locator('#step-one').boundingBox())!;
    expect(target.y).toBeLessThan(0);

    const popover = (await page.locator('.gf-popover').boundingBox())!;
    const viewport = page.viewportSize()!;
    await expect(page.locator('.gf-popover')).toHaveAttribute('data-placement', 'center');
    expect(popover.y).toBeGreaterThanOrEqual(-1);
    expect(popover.y + popover.height).toBeLessThanOrEqual(viewport.height + 1);
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
    // The Done button, not `[data-gf-action="end"]`. The header's × still
    // carries `end`, and `end` maps to stop() — which abandons the tour rather
    // than completing it, so the snapshot would never be cleared and this test
    // would be asserting the opposite of its name.
    await page.click('.gf-popover .gf-btn-primary');
    await expect(page.locator('.gf-popover')).toBeHidden();

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    await page.click('#start-persisted-btn');

    await expect(page.locator('.gf-popover')).toBeHidden();
    expect(await page.evaluate(() => window.__gfEnters)).toEqual([]);
  });
});

test.describe('Target-only interaction', () => {
  // ADR-004 recorded this as a known limitation: the overlay was a single
  // full-viewport div, so `clickThrough: true` dropped pointer capture entirely
  // and made the WHOLE PAGE interactive. "Let the user click the button I am
  // pointing at" — the thing the option is named for — was unimplementable
  // (AUDIT `clickthrough-exposes-whole-page`).
  //
  // These are the only tests that can prove it: hit-testing through a
  // clip-path needs a real layout engine, and happy-dom has none.

  test('a click lands on the highlighted target', async ({ page }) => {
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('#clickable-target');

    await expect(page.locator('#click-count')).toHaveText('1');
    // And the tour is still running — the click went to the page, not through
    // a dismiss handler.
    await expect(page.locator('.gf-popover')).toBeVisible();
  });

  test('the rest of the page stays blocked', async ({ page }) => {
    // The half that was broken in the other direction: clickThrough used to
    // expose everything.
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const blocked = await page.evaluate(() => {
      // Hit-test a point far from the target. The overlay must be what is
      // under the cursor there.
      const el = document.elementFromPoint(5, 5);
      return el?.hasAttribute('data-gf-overlay') ?? false;
    });
    expect(blocked).toBe(true);
  });

  test('the target is unreachable when clickThrough is off', async ({ page }) => {
    await page.click('#start-blocking-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    // Playwright's actionability check fails when something intercepts the
    // click — which is exactly the assertion, and it does not depend on where
    // the popover happens to land on a given viewport.
    await expect(
      page.locator('#clickable-target').click({ timeout: 2000 }),
    ).rejects.toThrow(/intercepts pointer events|not stable|timeout/i);

    await expect(page.locator('#click-count')).toHaveText('0');
  });

  test('the hole matches the target rect exactly', async ({ page }) => {
    // Geometric rather than a hit-test at the target's centre: on a narrow
    // viewport (Pixel 5) the 320px popover can sit over that centre, so the
    // element under it is the popover on some projects and the target on
    // others. The clip-path is what the browser hit-tests against, so assert
    // on that instead.
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('[data-gf-overlay]');
      const cutout = document.querySelector<HTMLElement>('[data-gf-spotlight-cutout]');
      if (!overlay || !cutout) return null;
      const box = cutout.getBoundingClientRect();
      return {
        clip: overlay.style.clipPath,
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.clip).toContain('evenodd');

    // Parse the hole's corners rather than substring-matching: the browser
    // serialises sub-pixel values (158.391px), so the numbers in the string are
    // not the integers a rect rounds to.
    const pairs = [...geometry!.clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map(
      (m) => [Number(m[1]), Number(m[2])] as const,
    );
    // The outer ring contributes one `0px 0px` pair twice; the rest is the hole.
    const hole = pairs.slice(2);
    expect(hole.length).toBeGreaterThanOrEqual(4);

    const xs = hole.map((p) => p[0]);
    const ys = hole.map((p) => p[1]);
    // The hole is the cutout's own rect, so the dimmed ring and the interactive
    // region cannot drift apart.
    expect(Math.abs(Math.min(...xs) - geometry!.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.min(...ys) - geometry!.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.max(...xs) - geometry!.right)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.max(...ys) - geometry!.bottom)).toBeLessThanOrEqual(1);
  });

  test('the hole follows the target through a scroll', async ({ page }) => {
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);

    const stillOnTop = await page.evaluate(() => {
      const target = document.getElementById('clickable-target')!;
      const box = target.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) return 'offscreen';
      const el = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return el === target || target.contains(el) ? 'target' : 'covered';
    });
    // A stale clip-path would leave the hole where the target used to be.
    expect(stillOnTop).not.toBe('covered');
  });
});

test.describe('Themes', () => {
  // The five shipped themes are CSS attribute selectors, and nothing in the
  // library ever set the attribute they key on — a documented feature that did
  // nothing (AUDIT `experiment-variant-cannot-affect-any-tour`, theme half).
  // This is the only place computed style is real.

  test('does not touch data-gf-theme by default', async ({ page }) => {
    // A host page that sets its own theme must not be clobbered by an instance
    // with no opinion.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const attr = await page.evaluate(() =>
      document.documentElement.getAttribute('data-gf-theme'),
    );
    expect(attr).toBeNull();
  });

  test('applies a theme through configure()', async ({ page }) => {
    await page.click('#apply-brutalist-btn');
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await expect(page.locator('html')).toHaveAttribute('data-gf-theme', 'brutalist');

    const style = await page.evaluate(() => {
      const el = document.querySelector('.gf-popover');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { radius: cs.borderTopLeftRadius, border: cs.borderTopWidth };
    });

    expect(style).not.toBeNull();
    // The brutalist theme is square-cornered with a 2px border. Nothing but a
    // real browser can tell us the cascade actually reached the popover.
    expect(style!.radius).toBe('0px');
    expect(style!.border).toBe('2px');
  });
});
