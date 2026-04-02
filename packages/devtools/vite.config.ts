import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync } from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    // Copy manifest.json and static assets to dist after build
    {
      name: 'copy-manifest',
      closeBundle() {
        mkdirSync('dist', { recursive: true });
        copyFileSync('manifest.json', 'dist/manifest.json');
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // DevTools panel UI
        panel: resolve(__dirname, 'src/panel/index.html'),
        // Background service worker
        background: resolve(__dirname, 'src/background/service-worker.ts'),
        // Content script injected into every page
        content: resolve(__dirname, 'src/content/inspector.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
