import { test, expect } from '@playwright/test';

/**
 * `createTargeting().install()` against a real browser history.
 *
 * These two cases cannot be written anywhere else. happy-dom's
 * `history.pushState` does not move `window.location.href`, so `watchHistory`'s
 * href-coalescing correctly swallows it and a unit assertion would be testing
 * the mock rather than the code. The fixture drives an actual ~10-line
 * pushState router, standing in for React Router et al.
 *
 * What was measured before the fix (see ADR-016):
 *
 *  - `install()` listened to `popstate` and nothing else, so a `load` flow was
 *    re-evaluated on the back button and on no other navigation. Every SPA
 *    route change is a `pushState`.
 *  - `install()` filtered `listFlows()` exactly once, so a flow registered
 *    afterwards was invisible to the `selector` trigger — which collides
 *    head-on with `guide/hosting-flows.md`, where flows arrive from a `fetch`
 *    and are registered whenever it resolves.
 *
 * Both flows below are registered AFTER `install()` on purpose.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('targeting install()', () => {
  test('starts a load flow registered after install(), on a pushState navigation', async ({
    page,
  }) => {
    await page.evaluate(() => window.__gfInstallTargeting());

    // Nothing is eligible yet — every fixture flow is `manual`. Registering
    // now means the install-time `autoStart('load')` has already been and gone.
    await page.evaluate(() => {
      window.__guideflow.createFlow({
        id: 'targeted-late',
        targeting: { startTrigger: 'load' },
        initial: 'main',
        states: {
          main: { steps: [{ id: 'late-1', content: { title: 'Targeted late' } }], final: true },
        },
      });
    });
    await expect(page.locator('.gf-popover')).toBeHidden();

    // A real pushState. No popstate is dispatched by this.
    await page.evaluate(() => window.__gfGo('settings'));

    await expect(page.locator('.gf-popover')).toContainText('Targeted late');
  });

  test('arms a selector flow registered after install(), and does not re-arm it', async ({
    page,
  }) => {
    await page.evaluate(() => window.__gfInstallTargeting());

    await page.evaluate(() => {
      window.__guideflow.createFlow({
        id: 'targeted-selector',
        targeting: { startTrigger: 'selector', selector: '#targeting-late-el' },
        initial: 'main',
        states: {
          main: { steps: [{ id: 'sel-1', content: { title: 'Selector fired' } }], final: true },
        },
      });
    });
    await expect(page.locator('.gf-popover')).toBeHidden();

    await page.evaluate(() => {
      const el = document.createElement('div');
      el.id = 'targeting-late-el';
      document.body.appendChild(el);
    });
    await expect(page.locator('.gf-popover')).toContainText('Selector fired');

    // Close it, then mutate the DOM. The observer used to have no memory and
    // never disconnected, so this restarted the tour the user had just closed —
    // and would have again on the next mutation, indefinitely.
    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden();

    await page.evaluate(() => document.body.appendChild(document.createElement('span')));
    await page.waitForTimeout(300);
    await expect(page.locator('.gf-popover')).toBeHidden();
  });
});
