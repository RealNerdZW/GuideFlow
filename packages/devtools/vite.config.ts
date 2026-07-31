import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    // Copy static files to dist after build
    {
      name: 'copy-static',
      closeBundle() {
        const dist = resolve(__dirname, 'dist');
        mkdirSync(dist, { recursive: true });

        // manifest.json
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(dist, 'manifest.json'),
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

        // Move the Vite-emitted HTML from dist/src/panel/index.html → dist/panel.html
        // and fix the script path (Vite computes relative to the original location)
        const nestedHtml = resolve(dist, 'src/panel/index.html');
        if (existsSync(nestedHtml)) {
          let html = readFileSync(nestedHtml, 'utf-8');
          // Fix paths: the HTML is now at root, not src/panel/
          html = html.replace(/(\.\.\/){2}/g, './');
          // Strip crossorigin attribute (unnecessary in Chrome extensions and
          // can cause issues with CSP)
          html = html.replace(/\s+crossorigin/g, '');
          writeFileSync(resolve(dist, 'panel.html'), html);
        }

        // Move the Vite-emitted popup HTML from dist/src/popup/popup.html → dist/popup.html
        const nestedPopup = resolve(dist, 'src/popup/popup.html');
        if (existsSync(nestedPopup)) {
          let html = readFileSync(nestedPopup, 'utf-8');
          html = html.replace(/(\.\.\/){2}/g, './');
          html = html.replace(/\s+crossorigin/g, '');
          writeFileSync(resolve(dist, 'popup.html'), html);
        }

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
