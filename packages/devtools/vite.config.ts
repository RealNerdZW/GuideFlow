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
          html = html.replace(/src="\.\.\/\.\.\/panel\.js"/g, 'src="./panel.js"');
          html = html.replace(/src="\.\.\/\.\.\/chunks\//g, 'src="./chunks/');
          // Strip crossorigin attribute (unnecessary in Chrome extensions and
          // can cause issues with CSP)
          html = html.replace(/\s+crossorigin/g, '');
          writeFileSync(resolve(dist, 'panel.html'), html);
          // Clean up the now-empty src/ tree
          rmSync(resolve(dist, 'src'), { recursive: true, force: true });
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
        // DevTools panel UI — the only HTML that Vite needs to process
        panel: resolve(__dirname, 'src/panel/index.html'),
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
