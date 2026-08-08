import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

/**
 * The previous version of this file imported a default `AxeBuilder` from
 * `axe-playwright`, which exports no such thing — that class belongs to
 * `@axe-core/playwright`. The import threw before a single assertion ran.
 *
 * The `test.fixme` markers that stood here through Phase 2 are gone: Phase 6
 * implemented the focus trap, focus restoration, live region, progressbar
 * naming and reduced-motion handling they were waiting on. These are the only
 * tests in the repo that exercise any of that against a real layout engine —
 * happy-dom reports `offsetParent === null` for every element, so tab order
 * cannot be measured in a unit test.
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

  // ── Phase 6 ───────────────────────────────────────────────────────────────

  test('focus is trapped inside the dialog', async ({ page }) => {
    // Regression for `no-focus-trap-or-restore`. More presses than there are
    // controls, so an untrapped dialog is guaranteed to have leaked focus out
    // into the page behind the overlay.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');

    const stillInside = await page.evaluate(() => {
      const popover = document.querySelector('.gf-popover');
      return !!popover && popover.contains(document.activeElement);
    });
    expect(stillInside).toBe(true);
  });

  test('Shift+Tab is trapped too', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+Tab');

    const stillInside = await page.evaluate(() => {
      const popover = document.querySelector('.gf-popover');
      return !!popover && popover.contains(document.activeElement);
    });
    expect(stillInside).toBe(true);
  });

  test('focus returns to the trigger when the tour closes', async ({ page }) => {
    // Regression for `no-focus-trap-or-restore`. Focus the trigger explicitly
    // rather than relying on the click: WebKit does not focus a button on
    // mousedown, so `page.click()` would leave focus on <body> and this test
    // would be asserting nothing.
    await page.locator('#start-btn').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toHaveCount(0);

    const activeId = await page.evaluate(() => document.activeElement?.id);
    expect(activeId).toBe('start-btn');
  });

  test('step changes are announced to assistive technology', async ({ page }) => {
    // Regression for `no-live-region`.
    await page.click('#start-btn');
    const region = page.locator('[aria-live="polite"]');
    await expect(region).toHaveCount(1);
    await expect(region).toContainText('Step One');

    // The region must sit outside the popover, or removing the popover would
    // take the announcement with it.
    const outside = await page.evaluate(() => {
      const popover = document.querySelector('.gf-popover');
      const live = document.querySelector('[aria-live="polite"]');
      return !!popover && !!live && !popover.contains(live);
    });
    expect(outside).toBe(true);

    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect(region).toContainText('Step Two');
  });

  test('the live region is hidden visually but not from the a11y tree', async ({ page }) => {
    await page.click('#start-btn');
    // The render pipeline scrolls and settles before the renderer runs, so the
    // region does not exist the instant the click returns.
    await expect(page.locator('[aria-live="polite"]')).toHaveCount(1);

    const styles = await page.evaluate(() => {
      const el = document.querySelector('[aria-live="polite"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { display: cs.display, visibility: cs.visibility };
    });
    expect(styles).not.toBeNull();
    expect(styles!.display).not.toBe('none');
    expect(styles!.visibility).not.toBe('hidden');
  });

  test('the progress bar announces a step count, not a percentage', async ({ page }) => {
    // Regression for `progressbar-no-name-or-valuetext`.
    await page.click('#start-btn');
    const bar = page.locator('[role="progressbar"]');
    await expect(bar).toHaveAttribute('aria-valuetext', /step/i);
    await expect(bar).toHaveAttribute('aria-label', /.+/);
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    await expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  test('animations respect prefers-reduced-motion', async ({ page }) => {
    // Regression for `no-reduced-motion-guard`.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const animation = await page.evaluate(() => {
      const el = document.querySelector('.gf-popover');
      return el ? getComputedStyle(el).animationName : null;
    });
    expect(animation).toBe('none');
  });

  test('the spotlight cutout does not animate under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const transition = await page.evaluate(() => {
      const el = document.querySelector('[data-gf-spotlight-cutout]') as HTMLElement | null;
      return el ? el.style.transition : null;
    });
    // Assigned from script, so a CSS media query could never have covered it.
    expect(transition).toBe('none');
  });

  // The arrow-keys-in-an-input case lives in `tour-flow.spec.ts`, which owns
  // the fixture's `#text-input`. This is its counterpart: the guard must not
  // take away the one key a keyboard user needs to get out.
  test('Escape still closes the tour from inside a text field', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.locator('#text-input').focus();
    await page.keyboard.press('Escape');

    await expect(page.locator('.gf-popover')).toHaveCount(0);
  });

  test('RTL does not reverse the action buttons', async ({ page }) => {
    // Regression for `rtl-double-flip`: `flex-direction: row-reverse` under
    // `dir="rtl"` undid the browser's own mirroring and put Back/Next back into
    // left-to-right order.
    await page.evaluate(() => { document.documentElement.setAttribute('dir', 'rtl'); });
    await page.click('#start-btn');
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect(page.locator('.gf-popover-title')).toHaveText('Step Two');

    const order = await page.evaluate(() => {
      const back = document.querySelector('.gf-popover [data-gf-action="prev"]');
      const next = document.querySelector('.gf-popover [data-gf-action="next"]');
      if (!back || !next) return null;
      return {
        backLeft: back.getBoundingClientRect().left,
        nextLeft: next.getBoundingClientRect().left,
      };
    });
    expect(order).not.toBeNull();
    // Reading order is right-to-left, so Back — which comes first in the DOM —
    // must sit to the RIGHT of Next.
    expect(order!.backLeft).toBeGreaterThan(order!.nextLeft);
  });

  test('no critical violations with a tour open in RTL', async ({ page }) => {
    await page.evaluate(() => { document.documentElement.setAttribute('dir', 'rtl'); });
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
});

test.describe('clickThrough steps are keyboard-reachable', () => {
  // Phase 8.1b. ADR-004 cut a hole in the overlay so exactly one element stays
  // live to the mouse; this is the same hole in the tab order. Before it, a
  // step saying "click Save" was followable with a mouse and impossible with a
  // keyboard — and `advanceOn` (ADR-020) made that gap matter, because the tour
  // then waits for an interaction the keyboard user cannot perform.
  //
  // None of this is observable in happy-dom: `_focusables` filters on
  // `offsetParent !== null`, which is null for everything there, so the trap
  // has nothing to iterate and a unit test proves nothing about it.

  test('Tab reaches the highlighted control', async ({ page }) => {
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    // More presses than the popover has controls, so an unwidened trap would
    // have cycled back to the start and never landed on the target.
    let reached = false;
    for (let i = 0; i < 10 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.id === 'clickable-target');
    }
    expect(reached).toBe(true);
  });

  test('Shift+Tab comes back out of it, into the popover', async ({ page }) => {
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.locator('#clickable-target').focus();
    await page.keyboard.press('Shift+Tab');

    const inPopover = await page.evaluate(() =>
      !!document.querySelector('.gf-popover')?.contains(document.activeElement));
    expect(inPopover).toBe(true);
  });

  test('the rest of the page is still unreachable', async ({ page }) => {
    // The widening is exactly one element, not an escape hatch. Everything
    // else behind the overlay stays out of the tab order.
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');

    const where = await page.evaluate(() => {
      const active = document.activeElement;
      const popover = document.querySelector('.gf-popover');
      if (popover?.contains(active)) return 'popover';
      if (active?.id === 'clickable-target') return 'target';
      return active?.tagName === 'BODY' ? 'body' : `escaped:${active?.id || active?.tagName}`;
    });
    expect(['popover', 'target']).toContain(where);
  });

  test('aria-modal is dropped, because the page is provably not inert', async ({ page }) => {
    await page.click('#start-clickthrough-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('.gf-popover')).not.toHaveAttribute('aria-modal', 'true');
  });

  test('an ordinary step keeps aria-modal and the tight trap', async ({ page }) => {
    // The other half: widening must not leak into steps that never asked for it.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('.gf-popover')).toHaveAttribute('aria-modal', 'true');

    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    const stillInside = await page.evaluate(() =>
      !!document.querySelector('.gf-popover')?.contains(document.activeElement));
    expect(stillInside).toBe(true);
  });
});

test.describe('focus is not stolen, and completion is announced', () => {
  // Phase 8.1c. All three defects here were invisible to the unit suite for the
  // same reason: `_focusables` filters on `offsetParent !== null`, which is null
  // for everything in happy-dom, so the renderer's focus logic never runs there.

  test('a step change does not yank focus off a control the user is using', async ({ page }) => {
    // `renderStep` used to focus the popover's first control on EVERY render.
    // Document order puts the header close button first, so advancing while the
    // user is typing moved focus to it — and their next space keystroke
    // activated it, ending the tour. WCAG 3.2.2.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.locator('#text-input').focus();
    await page.evaluate(() => { void window.__guideflow.next(); });
    await expect(page.locator('.gf-popover')).toContainText('Step 2');

    const stillTyping = await page.evaluate(() => document.activeElement?.id === 'text-input');
    expect(stillTyping).toBe(true);
  });

  test('pressing Next still moves focus into the new step', async ({ page }) => {
    // The other half — the ordinary path must be unchanged. Focus was inside
    // the popover, so it belongs inside the popover.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toContainText('Step 2');

    const inPopover = await page.evaluate(() =>
      !!document.querySelector('.gf-popover')?.contains(document.activeElement));
    expect(inPopover).toBe(true);
  });

  test('focus is not ripped back when the app moved it during the tour', async ({ page }) => {
    // WCAG 2.4.3, and `advanceOn` made it reachable: the user acts on the
    // highlighted control, the app focuses something of its own, and the tour
    // ending must not throw focus back to a button from before it started.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    await page.locator('#text-input').focus();
    await page.evaluate(() => { window.__guideflow.stop(); });
    await expect(page.locator('.gf-popover')).toBeHidden();

    const where = await page.evaluate(() => document.activeElement?.id);
    expect(where).toBe('text-input');
  });

  test('completion is announced', async ({ page }) => {
    await page.click('#start-final-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await page.click('[data-gf-action="next"]');
    await page.click('[data-gf-action="next"]');
    await expect(page.locator('.gf-popover')).toBeHidden();

    await expect(page.locator('[role="status"][aria-live="polite"]'))
      .toHaveText('Tour complete');
  });

  test('an abandoned tour says nothing', async ({ page }) => {
    // Escape is a user action the AT has already spoken to.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden();

    await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveCount(0);
  });
});
