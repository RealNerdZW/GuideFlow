import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { chromium, expect, test } from '@playwright/test';

/**
 * The zip a user actually downloads must load as an extension.
 *
 * Everything else in this directory tests `packages/devtools/dist`. This tests
 * the artefact built FROM it — because "the build is fine" and "the download
 * works" are different claims, and the ways a zip breaks are specific:
 * `manifest.json` nested one directory down is the classic one, and Chrome's
 * refusal names neither the cause nor the file.
 *
 * Chromium cannot load a `.zip` directly, so the test unpacks it and loads the
 * result — which is exactly the sequence the install instructions ask a user to
 * perform, and therefore exactly what should be verified.
 */

const REPO = path.resolve(__dirname, '../../..');

test('the packaged zip unpacks to a loadable extension', async () => {
  test.slow();

  const zipDir = mkdtempSync(path.join(tmpdir(), 'gf-zip-'));
  const unpacked = mkdtempSync(path.join(tmpdir(), 'gf-unpacked-'));
  try {
    // Pack from the dist the other specs just exercised.
    execFileSync(process.execPath, [path.join(REPO, 'scripts/pack-extension.mjs')], {
      cwd: REPO,
      stdio: 'pipe',
    });

    const manifest = JSON.parse(
      execFileSync(
        process.execPath,
        ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(path.join(REPO, 'packages/devtools/dist/manifest.json'))},'utf8'))`],
        { encoding: 'utf8' },
      ),
    ) as { version: string };
    const zip = path.join(REPO, `guideflow-devtools-${manifest.version}.zip`);

    // Unpack with the platform's own tool, the way a user would.
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -LiteralPath "${zip}" -DestinationPath "${unpacked}" -Force`],
        { stdio: 'pipe' },
      );
    } else {
      execFileSync('unzip', ['-q', '-o', zip, '-d', unpacked], { stdio: 'pipe' });
    }

    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${unpacked}`, `--load-extension=${unpacked}`],
    });
    try {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      // If manifest.json were nested, or a referenced file were missing, the
      // extension would not load and there would be no worker at all.
      const loaded = await worker.evaluate(() => chrome.runtime.getManifest());
      expect(loaded.manifest_version).toBe(3);
      expect(loaded.version).toBe(manifest.version);

      // And the Recorder page it advertises is really in the archive.
      const id = new URL(worker.url()).host;
      const page = await context.newPage();
      const response = await page.goto(`chrome-extension://${id}/recorder.html`);
      expect(response?.status()).toBe(200);
      await expect(page.getByText('No tab to record')).toBeVisible();
    } finally {
      await context.close();
    }
  } finally {
    rmSync(zipDir, { recursive: true, force: true });
    rmSync(unpacked, { recursive: true, force: true });
  }
});
