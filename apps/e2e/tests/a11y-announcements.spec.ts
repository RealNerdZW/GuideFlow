import { test, expect } from '@playwright/test';

/**
 * What a screen reader would actually SAY, in order, with four live regions on
 * one page.
 *
 * This is not a manual screen-reader pass and does not replace one — pacing,
 * interruption and verbosity only exist when a human listens. What it does is
 * capture the one thing nobody had measured: the tour renderer, the checklist,
 * the banner and the survey each own a polite `aria-live` region, and until now
 * no test had ever had all four on a page at the same time to see what the
 * utterance sequence looks like.
 *
 * A polite region does not interrupt; the AT queues it. So four regions that
 * all speak on load do not overlap — they QUEUE, and the user hears all four
 * before reaching the page. That is the failure mode this file exists to
 * measure, and it is invisible to axe, which checks rules rather than output.
 *
 * The instrumentation records every mutation to every `[aria-live]` element,
 * tagged by which surface owns it, with a timestamp relative to the first
 * utterance.
 */

/** Install before anything mounts: the regions do not exist yet. */
const RECORDER = `
  window.__gfSaid = [];
  window.__gfT0 = null;
  const seen = new WeakSet();
  const label = (el) => {
    const id = el.id || '';
    if (id.startsWith('gf-checklist-live')) return 'checklist';
    if (id.startsWith('gf-banner-live')) return 'banner';
    if (id.startsWith('gf-survey-live')) return 'survey';
    return 'renderer';
  };
  const watch = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    new MutationObserver(() => {
      const text = (el.textContent || '').trim();
      if (!text) return;                       // the clear half of clear-then-write
      if (window.__gfT0 === null) window.__gfT0 = performance.now();
      window.__gfSaid.push({
        source: label(el),
        text,
        at: Math.round(performance.now() - window.__gfT0),
        politeness: el.getAttribute('aria-live'),
        role: el.getAttribute('role'),
      });
    }).observe(el, { childList: true, characterData: true, subtree: true });
  };
  // Observe the DOCUMENT, not documentElement. addInitScript runs at
  // document-start, before the parser has created the html element — observing
  // null throws, and the whole init script dies silently, leaving __gfSaid
  // defined but forever empty. That is exactly how this instrumentation first
  // "proved" the library announces nothing.
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.hasAttribute && node.hasAttribute('aria-live')) watch(node);
        if (node.querySelectorAll) node.querySelectorAll('[aria-live]').forEach(watch);
      }
    }
  }).observe(document, { childList: true, subtree: true });
`;

interface Utterance {
  source: string;
  text: string;
  at: number;
  politeness: string | null;
  role: string | null;
}

const said = (page: import('@playwright/test').Page): Promise<Utterance[]> =>
  page.evaluate(() => window.__gfSaid as unknown as Utterance[]);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(RECORDER);
  await page.goto('index.html');
  await page.waitForFunction(() => window.__gfReady === true);
  await page.evaluate(() => localStorage.clear());
});

test.describe('what gets announced', () => {
  test('a tour announces each step once, and only the step', async ({ page }) => {
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();
    await page.locator('.gf-popover [data-gf-action="next"]').click();
    await expect(page.locator('.gf-popover')).toContainText('Step Two');
    await page.waitForTimeout(200);

    const utterances = await said(page);
    // eslint-disable-next-line no-console
    console.log('TOUR UTTERANCES:', JSON.stringify(utterances, null, 2));

    expect(utterances.every((u) => u.source === 'renderer')).toBe(true);
    // One utterance per step, not one per re-render.
    expect(utterances).toHaveLength(2);
    expect(utterances[0]?.text).toContain('Step One');
    expect(utterances[1]?.text).toContain('Step Two');

    // No doubled sentence punctuation. A body that already ends in a full stop
    // used to produce "This is step one.. Step 1 of 3" — measured in the live
    // region, and every screen reader pauses oddly on it.
    for (const u of utterances) {
      expect(u.text, u.text).not.toMatch(/[.!?]\s*[.!?]/);
    }
  });

  test('every live region is polite — nothing in this library interrupts', async ({ page }) => {
    // `role="alert"` and `aria-live="assertive"` cut off whatever the AT is
    // currently saying. A tour step announcement being severed mid-sentence by
    // a banner is the specific defect three ADRs refused to ship.
    await page.evaluate((defs) => window.__gfMountBanners(defs), [
      { id: 'b', title: 'Banner title', body: 'Banner body.' },
    ]);
    await page.evaluate((defs) => window.__gfMountSurveys(defs), [
      { id: 's', question: 'Survey question?' },
    ]);
    await page.click('#mount-checklist-btn');
    await page.waitForFunction(() => window.__gfChecklistReady === true);
    await page.click('#start-btn');
    await page.waitForTimeout(300);

    const regions = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-live]')].map((el) => ({
        live: el.getAttribute('aria-live'),
        role: el.getAttribute('role'),
      })),
    );
    expect(regions.length).toBeGreaterThan(0);
    for (const r of regions) {
      expect(r.live).toBe('polite');
      expect(r.role).not.toBe('alert');
    }
    expect(await page.locator('[role="alert"]').count()).toBe(0);
    expect(await page.locator('[aria-live="assertive"]').count()).toBe(0);
  });

  test('THE PILE-UP: how many things speak before the user has done anything', async ({ page }) => {
    // The measurement this file exists for. Mount every docked surface, touch
    // nothing, and count what a polite queue would read out on arrival.
    await page.evaluate((defs) => window.__gfMountBanners(defs), [
      { id: 'b', title: 'We shipped v2', body: 'Faster exports.' },
    ]);
    await page.evaluate((defs) => window.__gfMountSurveys(defs), [
      { id: 's', question: 'How likely are you to recommend us?' },
    ]);
    await page.click('#mount-checklist-btn');
    await page.waitForFunction(() => window.__gfChecklistReady === true);
    await page.waitForTimeout(500);

    const utterances = await said(page);
    // eslint-disable-next-line no-console
    console.log('ON-ARRIVAL QUEUE:', JSON.stringify(utterances, null, 2));

    // The checklist deliberately says nothing until an item ticks, so arriving
    // at a page with all three docked surfaces should queue TWO utterances at
    // most. Three or more is a wall of speech before the page is reachable.
    expect(
      utterances.length,
      `a screen-reader user would hear ${utterances.length} announcements on arrival: ` +
        utterances.map((u) => `"${u.text}"`).join(' then '),
    ).toBeLessThanOrEqual(2);
    expect(utterances.some((u) => u.source === 'checklist')).toBe(false);
  });

  test('THE RELEASE: what happens when a tour ends with surfaces holding utterances', async ({
    page,
  }) => {
    // Each docked surface holds its announcement while a tour runs and releases
    // it on the falling edge. Three surfaces releasing at once is a burst, and
    // nothing had ever put all three in that state together.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    // Mount everything WHILE the tour is up, so each one has something held.
    await page.evaluate((defs) => window.__gfMountBanners(defs), [
      { id: 'b', title: 'We shipped v2' },
    ]);
    await page.evaluate((defs) => window.__gfMountSurveys(defs), [
      { id: 's', question: 'How likely are you to recommend us?' },
    ]);
    await page.waitForTimeout(200);
    const duringTour = await said(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('.gf-popover')).toBeHidden();
    await page.waitForTimeout(400);

    const after = await said(page);
    const released = after.slice(duringTour.length);
    // eslint-disable-next-line no-console
    console.log('RELEASED ON TOUR END:', JSON.stringify(released, null, 2));

    // Nothing docked may speak over a running tour.
    expect(duringTour.every((u) => u.source === 'renderer')).toBe(true);

    // And the release must not be a burst. Two is a pair; three is a monologue.
    expect(
      released.length,
      `closing the tour released ${released.length} announcements at once: ` +
        released.map((u) => `"${u.text}"`).join(' then '),
    ).toBeLessThanOrEqual(2);
  });

  test('a checklist tick announces the aggregate, not each item', async ({ page }) => {
    await page.click('#mount-checklist-btn');
    await page.waitForFunction(() => window.__gfChecklistReady === true);
    await page.evaluate(() => window.__gfChecklist?.complete('data'));
    await page.waitForTimeout(300);

    const utterances = (await said(page)).filter((u) => u.source === 'checklist');
    expect(utterances.length).toBeLessThanOrEqual(1);
    if (utterances[0]) expect(utterances[0].text).toMatch(/\d+ of \d+|complete/i);
  });
});

test.describe('the accessibility tree', () => {
  test('a tour step exposes a named dialog with its content', async ({ page }) => {
    // `ariaSnapshot()` is the ARIA tree Playwright derives the way an AT would,
    // and it works on all three engines. `page.accessibility` was removed.
    await page.click('#start-btn');
    await expect(page.locator('.gf-popover')).toBeVisible();

    const tree = await page.locator('.gf-popover').ariaSnapshot();
    // eslint-disable-next-line no-console
    console.log('POPOVER ARIA TREE:\n' + tree);

    // A dialog with no accessible name is announced as just "dialog".
    expect(tree).toMatch(/dialog "[^"]+"/);
    expect(tree).toContain('Step One');
  });

  test('every docked surface is a named landmark in the tree', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountBanners(defs), [
      { id: 'b', title: 'We shipped v2' },
    ]);
    await page.evaluate((defs) => window.__gfMountSurveys(defs), [
      { id: 's', question: 'How likely are you to recommend us?' },
    ]);
    await page.waitForTimeout(200);

    const named = await page.evaluate(() =>
      [...document.querySelectorAll('[role="region"]')].map((el) => ({
        cls: el.className,
        name: el.getAttribute('aria-label') ?? el.getAttribute('aria-labelledby'),
      })),
    );
    // A region with no accessible name is not exposed as a landmark at all, so
    // the label is load-bearing rather than decorative.
    expect(named.length).toBeGreaterThanOrEqual(2);
    for (const region of named) expect(region.name, region.cls).toBeTruthy();
  });

  test('the survey scale exposes a named radiogroup with counted options', async ({ page }) => {
    await page.evaluate((defs) => window.__gfMountSurveys(defs), [
      { id: 's', question: 'How likely are you to recommend us?' },
    ]);
    await expect(page.locator('.gf-survey')).toBeVisible();

    const tree = await page.locator('.gf-survey').ariaSnapshot();
    // eslint-disable-next-line no-console
    console.log('SURVEY ARIA TREE:\n' + tree);

    // A radiogroup with no accessible name announces eleven bare numbers.
    expect(tree).toMatch(/radiogroup "[^"]*recommend[^"]*"/);
    // `- radio "` and not `- radio`, which also matches `- radiogroup`.
    expect(tree.match(/- radio "/g) ?? []).toHaveLength(11);

    // And each value appears EXACTLY once. The visible number is a span inside
    // the label, which the tree exposed as its own text node beside the radio
    // it names — so the group read "0, 0, 1, 1, 2, 2" all the way up. Measured,
    // then hidden with aria-hidden while the input took an explicit label.
    for (const value of ['0', '5', '10']) {
      const occurrences = tree.split(`"${value}"`).length - 1;
      expect(occurrences, `value ${value} appears ${occurrences} times in the tree`).toBe(1);
    }
  });
});
