import { test, expect } from '@playwright/test';

/**
 * The docked survey card, in a real browser.
 *
 * The radio-group decision is the reason this file exists. happy-dom has no tab
 * order and no arrow-key model for radios, so the whole justification for using
 * real `<input type="radio">` over a row of buttons — arrow keys move within the
 * group, Tab treats it as one stop — is unverifiable in the unit suite. Here it
 * is real.
 */

const NPS = [
  {
    id: 'nps',
    question: 'How likely are you to recommend us?',
    scale: { min: 0, max: 10, minLabel: 'Not likely', maxLabel: 'Very likely' },
    followUp: { label: 'Why?' },
    thanks: 'Thanks for the feedback.',
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('survey', () => {
  test('renders as a radiogroup and leaves the page usable', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);

    const card = page.locator('.gf-survey');
    await expect(card).toBeVisible();
    await expect(card.getByRole('radiogroup')).toHaveAttribute('aria-labelledby', /.+/);
    await expect(card.getByRole('radio')).toHaveCount(11);

    // Not a modal: no overlay, and the page underneath still works.
    await expect(page.locator('[data-gf-overlay]')).toHaveCount(0);
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
  });

  test('arrow keys move within the scale, and Tab leaves it as one stop', async ({ page }) => {
    // The entire argument for real radios over buttons, and it is only real
    // here. A row of buttons would need eleven Tab presses to cross.
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await expect(page.locator('.gf-survey')).toBeVisible();

    await page.getByRole('radio').first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');

    // Two arrow presses select the third value — and selecting it is what
    // reveals the follow-up.
    await expect(page.locator('.gf-survey-followup')).toBeVisible();
    const checked = await page.evaluate(
      () => document.querySelector<HTMLInputElement>('.gf-survey-scale input:checked')?.value,
    );
    expect(checked).toBe('2');

    // One Tab press leaves the whole group.
    await page.keyboard.press('Tab');
    const stillInGroup = await page.evaluate(
      () => document.querySelector('.gf-survey-scale')?.contains(document.activeElement) ?? false,
    );
    expect(stillInGroup).toBe(false);
  });

  test('is not a focus trap — Shift+Tab leaves it', async ({ page }) => {
    // BACKWARDS, and that is not laziness. Two browser facts make the forward
    // direction a bad assertion, and both were measured:
    //
    //   - Firefox makes every radio in an UNCHECKED group its own tab stop
    //     where Chromium makes only the first, so tabbing out of an untouched
    //     eleven-point scale takes one press in one browser and eleven in the
    //     other. Both are correct.
    //   - The card is the last thing in the document, and headless Firefox has
    //     no browser chrome for focus to move into — so forward Tab from the
    //     last control simply stays put. Measured: the trail ends
    //     dismiss, dismiss, dismiss. That is the harness, not a trap.
    //
    // Backwards has the whole page to land in and behaves identically
    // everywhere. A surface that does not trap going out the front does not
    // trap going out the back either: the only way to trap is a handler that
    // cancels the key, and there is none.
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await expect(page.locator('.gf-survey')).toBeVisible();

    await page.getByRole('radio', { name: '5' }).check();
    await page.getByRole('radio', { name: '5' }).focus();
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+Tab');

    const inside = await page.evaluate(
      () => document.querySelector('.gf-survey')?.contains(document.activeElement) ?? false,
    );
    expect(inside).toBe(false);
  });

  test('every control in the card is reachable, in order', async ({ page }) => {
    // The forward half, asserted as what it actually is: the card's own
    // controls are tab stops and they come in reading order. This is the part
    // that would break if someone added `tabindex="-1"` or reordered the DOM.
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await page.getByRole('radio', { name: '5' }).check();
    await page.getByRole('radio', { name: '5' }).focus();

    const seen: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Tab');
      seen.push(
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.className ?? ''),
      );
    }
    expect(seen).toEqual([
      'gf-survey-followup-input',
      'gf-survey-submit',
      'gf-survey-dismiss',
    ]);
  });

  test('answering reports the score and comment, then thanks', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);

    await page.getByRole('radio', { name: '9' }).check();
    await page.locator('.gf-survey-followup-input').fill('it is fast');
    await page.locator('.gf-survey-submit').click();

    await expect(page.locator('.gf-survey-thanks')).toHaveText('Thanks for the feedback.');
    await expect(page.locator('.gf-survey-scale')).toBeHidden();

    const events = await page.evaluate(() => window.__gfSurveyEvents);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'response', score: 9, comment: 'it is fast' }),
    );
  });

  test('does not ask again after an answer, across a reload', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await page.getByRole('radio', { name: '7' }).check();
    await page.locator('.gf-survey-submit').click();
    await expect(page.locator('.gf-survey-thanks')).toBeVisible();
    await page.locator('.gf-survey-dismiss').click();

    await page.reload();
    await page.waitForFunction(() => window.__gfReady === true);
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await expect(page.locator('.gf-survey')).toHaveCount(0);
  });

  test('a running tour covers it, and it comes back afterwards', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await expect(page.locator('.gf-survey')).toBeVisible();

    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await expect(page.locator('.gf-survey')).toBeHidden();
    await expect(page.locator('.gf-survey')).toHaveAttribute('inert', '');

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden();
    await expect(page.locator('.gf-survey')).toBeVisible();
  });

  test('every target meets the 44px floor', async ({ page }) => {
    // WCAG 2.5.8. Only measurable with a layout engine.
    await page.evaluate((defs) => window.__gfMountSurveys(defs), NPS);
    await expect(page.locator('.gf-survey')).toBeVisible();

    const tooSmall = await page.evaluate(() =>
      [...document.querySelectorAll('.gf-survey-value, .gf-survey-dismiss')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width < 44 || r.height < 44).length,
    );
    expect(tooSmall).toBe(0);
  });
});
