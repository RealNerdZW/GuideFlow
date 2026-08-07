// Drive the built demo in a real browser and check the docked surfaces work.
//
// `pnpm --filter @guideflow/demo build` going green proves the modules resolve.
// It does not prove the banner renders, that the survey's NPS scale is there,
// or that dismissing one persists — all of which are the point of wiring them
// in. This is a smoke test, not a suite: apps/e2e owns the real coverage.
//
// Usage: node smoke.mjs   (after `pnpm --filter @guideflow/demo build`)
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const DIST = resolve(import.meta.dirname, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// The demo builds with `base: '/GuideFlow/demo/'` for GitHub Pages, so every
// asset URL carries that prefix. Strip it, and fall back to index.html ONLY for
// extensionless paths — a blanket fallback answers a .js request with HTML,
// which Chrome refuses for a module script and which reads as "the app is
// broken" rather than "the server is".
const BASE_PATH = '/GuideFlow/demo/';

const server = createServer((req, res) => {
  let url = (req.url ?? '/').split('?')[0];
  if (url.startsWith(BASE_PATH)) url = '/' + url.slice(BASE_PATH.length);

  let file = join(DIST, url === '/' ? 'index.html' : url);
  if (!existsSync(file)) {
    if (extname(url)) {
      res.writeHead(404).end('not found: ' + url);
      return;
    }
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}${BASE_PATH}`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(base);
try {
  await page.waitForSelector('#gf-docked', { timeout: 15_000 });
} catch (error) {
  console.log('the demo did not render #gf-docked. errors:');
  for (const e of errors) console.log('  ' + e);
  const body = await page.evaluate(() => document.body.innerHTML.slice(0, 300));
  console.log('body starts:', body);
  await browser.close();
  server.close();
  process.exit(1);
}

const check = async (label, fn) => {
  const ok = await fn().catch(() => false);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  return ok;
};

let passed = 0;
const total = 8;

if (await check('the banner renders, docked at the top', async () =>
  (await page.locator('.gf-banner').count()) === 1 &&
  (await page.locator('.gf-banner').getAttribute('data-gf-dock')) === 'top')) passed++;

if (await check('the survey renders, bottom-start, clear of the checklist corner', async () =>
  (await page.locator('.gf-survey').count()) === 1 &&
  (await page.locator('.gf-survey').getAttribute('data-gf-dock')) === 'bottom-start')) passed++;

if (await check('the NPS scale has eleven radios', async () =>
  (await page.locator('.gf-survey input[type="radio"]').count()) === 11)) passed++;

if (await check('the page is still usable — no overlay', async () =>
  (await page.locator('[data-gf-overlay]').count()) === 0)) passed++;

if (await check('choosing a score reveals the follow-up', async () => {
  await page.locator('.gf-survey input[value="9"]').check();
  await page.waitForTimeout(150);
  return await page.locator('.gf-survey-followup-input').isVisible();
})) passed++;

if (await check('the checklist renders, bottom-end, with its four items', async () =>
  (await page.locator('.gf-checklist').count()) === 1 &&
  (await page.locator('.gf-checklist').getAttribute('data-gf-dock')) === 'bottom-end')) passed++;

if (await check('all three surfaces are in different corners', async () => {
  const dock = async (sel) => page.locator(sel).getAttribute('data-gf-dock');
  const docks = [await dock('.gf-banner'), await dock('.gf-survey'), await dock('.gf-checklist')];
  return new Set(docks).size === 3;
})) passed++;

if (await check('dismissing the banner survives a reload, and Reset brings it back', async () => {
  await page.locator('.gf-banner-dismiss').click();
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForSelector('#gf-docked');
  if ((await page.locator('.gf-banner').count()) !== 0) return false;
  await page.getByRole('button', { name: 'Show the banner again' }).click();
  await page.waitForTimeout(300);
  return (await page.locator('.gf-banner').count()) === 1;
})) passed++;

if (errors.length) {
  console.log('\nconsole/page errors:');
  for (const e of errors.slice(0, 5)) console.log('  ' + e);
}

await browser.close();
server.close();
console.log(`\n${passed}/${total} passed`);
process.exit(passed === total && errors.length === 0 ? 0 : 1);
