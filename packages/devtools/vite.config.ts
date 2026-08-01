import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

// The extension version lives in exactly one place: this package's
// package.json. It is written into dist/manifest.json by the plugin below and
// substituted into the panel and popup UIs through the `__GF_VERSION__` define
// (declared for TypeScript in src/version.d.ts).
const PKG_VERSION = (
  JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }
).version;

// Chrome's `version` accepts one to four dot-separated integers and nothing
// else, so a prerelease or build suffix — `0.2.0-beta.1`, which Changesets can
// produce — has to be stripped. `version_name` carries the full string for
// display in chrome://extensions.
const MANIFEST_VERSION = PKG_VERSION.split(/[-+]/)[0] ?? PKG_VERSION;

export default defineConfig({
  define: {
    __GF_VERSION__: JSON.stringify(PKG_VERSION),
  },
  plugins: [
    react(),
    // Copy static files to dist after build
    {
      name: 'copy-static',
      closeBundle() {
        const dist = resolve(__dirname, 'dist');
        mkdirSync(dist, { recursive: true });

        // manifest.json — the source file deliberately carries no `version`
        // key; it is injected here so package.json cannot drift out of sync
        // with the manifest Chrome actually loads.
        const manifest = JSON.parse(
          readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'),
        ) as Record<string, unknown>;
        manifest['version'] = MANIFEST_VERSION;
        if (MANIFEST_VERSION !== PKG_VERSION) manifest['version_name'] = PKG_VERSION;
        writeFileSync(
          resolve(dist, 'manifest.json'),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );

        // devtools.html bootstrap page (not processed by Vite)
        copyFileSync(
          resolve(__dirname, 'src/panel/devtools.html'),
          resolve(dist, 'devtools.html'),
        );

        // devtools.js bootstrap script (plain JS, not processed by Vite)
        copyFileSync(
          resolve(__dirname, 'src/devtools.js'),
          resolve(dist, 'devtools.js'),
        );

        // Move each Vite-emitted HTML file from dist/src/<dir>/<file> to the
        // dist root, and rewrite its asset paths — Vite computes them relative
        // to the original location.
        //
        // This THROWS when the source is missing. It used to be
        // `if (existsSync(nested)) { … }`, so a change in Rollup's output
        // layout would simply skip the write: `closeBundle` returned normally,
        // the build went green, and the extension shipped with no panel and no
        // popup. The bridge check below already fails loudly; these now match.
        const relocateHtml = (from: string, to: string): void => {
          const nested = resolve(dist, from);
          if (!existsSync(nested)) {
            throw new Error(
              `Expected Vite to emit ${from}, but it is missing. The Rollup output layout ` +
                `changed; update this relocation or ${to} will not exist in the extension.`,
            );
          }
          let html = readFileSync(nested, 'utf-8');
          // The file is at the dist root now, not two directories down.
          html = html.replace(/(\.\.\/)+/g, './');
          // `crossorigin` is unnecessary in an extension and trips the CSP.
          html = html.replace(/\s+crossorigin/g, '');
          writeFileSync(resolve(dist, to), html);
        };

        relocateHtml('src/panel/index.html', 'panel.html');
        relocateHtml('src/popup/popup.html', 'popup.html');
        relocateHtml('src/recorder/index.html', 'recorder.html');

        // Clean up the now-empty src/ tree
        if (existsSync(resolve(dist, 'src'))) {
          rmSync(resolve(dist, 'src'), { recursive: true, force: true });
        }

        // bridge.js is injected into the PAGE world as a *classic* script (see
        // src/content/inspector.ts `injectBridge`) so that
        // `document.currentScript` is non-null and the per-page-load nonce can
        // be read off the tag that is actually executing — inside a module
        // script `document.currentScript` is always null.
        //
        // Rollup emits ESM, whose top-level bindings are module-scoped; as a
        // classic script those same bindings would land in the page's global
        // lexical scope and could collide with the host app. Wrap the bundle in
        // a strict-mode IIFE to restore module-like isolation. This is only
        // sound while bridge.ts imports nothing, so fail the build loudly if
        // that ever changes.
        const bridgeFile = resolve(dist, 'bridge.js');
        if (existsSync(bridgeFile)) {
          const code = readFileSync(bridgeFile, 'utf-8');
          if (/(?:^|[;\n])\s*(?:import|export)\b/.test(code)) {
            throw new Error(
              'dist/bridge.js contains ESM syntax. bridge.ts must stay import-free so it can be ' +
                'injected as a classic script; move any shared helper back into bridge.ts.',
            );
          }
          writeFileSync(bridgeFile, `(function(){'use strict';\n${code}\n})();\n`);
        }

        // Icon assets
        const assetsDir = resolve(__dirname, 'assets');
        const distAssets = resolve(dist, 'assets');
        mkdirSync(distAssets, { recursive: true });
        for (const file of readdirSync(assetsDir)) {
          copyFileSync(resolve(assetsDir, file), resolve(distAssets, file));
        }
      },
    },
  ],
  // Relative base so that <script src="./panel.js"> works inside extensions
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // DevTools panel UI
        panel: resolve(__dirname, 'src/panel/index.html'),
        // Popup UI (toolbar icon)
        popup: resolve(__dirname, 'src/popup/popup.html'),
        // Recorder — the authoring surface, as an ordinary extension page.
        // A page rather than a DevTools tab because Playwright can open a page
        // and can NEVER open a devtools_page; see ADR-012.
        recorder: resolve(__dirname, 'src/recorder/index.html'),
        // Background service worker
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        // Content script injected into every page
        content: resolve(__dirname, 'src/content/inspector.ts'),
        // Bridge script injected into the page world by the content script
        bridge: resolve(__dirname, 'src/bridge.ts'),
      },
      output: {
        // Put all output files at the dist root (no nested src/panel/)
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
