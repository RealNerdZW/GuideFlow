import { readFile } from 'node:fs/promises'

import { defineConfig, type Options } from 'tsup'

/**
 * Minify the injected CSS template literals at build time.
 *
 * Four modules carry a `const *_CSS = \`…\`` block that `injectStyles` puts in a
 * `<style>` tag: the popover, the spotlight, hotspots and hints. They are
 * written readably, with comments and indentation, because they are read far
 * more often than they are changed — and every one of those bytes shipped.
 *
 * This is the rare saving that is real rather than bookkeeping: it shrinks what
 * an actual consumer downloads by the same amount it shrinks the gate, and it
 * removes no API. **~580 B gzip**, measured, which is more than the whole
 * content pipeline cost (ADR-022).
 *
 * The source stays exactly as it is. Only the emitted bytes change.
 *
 * Safe because none of the four interpolates: a `${…}` inside would be a
 * JavaScript expression, and handing that to a CSS parser would mangle it.
 * The guard below refuses those rather than silently corrupting them.
 */
const CSS_LITERAL = /const (\w*CSS) = `([^`]*)`/g

const minifyInjectedCss: NonNullable<Options['esbuildPlugins']>[number] = {
  name: 'gf-minify-injected-css',
  setup(build) {
    // Both separators. `args.path` is absolute and native, so on Windows this
    // is `…\src\renderer\default-renderer.ts` — a forward-slash-only filter
    // silently matches nothing there and the plugin looks like it did no work.
    build.onLoad({ filter: /[\\/]src[\\/].*\.ts$/ }, async (args) => {
      const source = await readFile(args.path, 'utf8')
      if (!source.includes('CSS = `')) return null

      let out = source
      let touched = false
      for (const [whole, name, body] of source.matchAll(CSS_LITERAL)) {
        // An interpolated block is a JS expression, not CSS. Leave it alone.
        if (body.includes('${')) continue
        // `build.esbuild`, not a top-level import: esbuild is tsup's dependency,
        // not this package's, and pnpm's strict layout means importing it here
        // fails to resolve. The plugin API hands us the same instance.
        const { code } = await build.esbuild.transform(body, { loader: 'css', minify: true })
        out = out.replace(whole, `const ${name} = \`${code.trim()}\``)
        touched = true
      }
      return touched ? { contents: out, loader: 'ts' } : null
    })
  },
}

/**
 * Several config objects, not several entries in one.
 *
 * The main bundle emits an IIFE with a `GuideFlow` global; a subpath must not.
 * `clean: true` also belongs to exactly one of them — the second would wipe the
 * first's output. Subpaths are declared here AND in package.json `exports`;
 * `scripts/verify-pack.mjs` fails CI if the two drift.
 */
export default defineConfig([{
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'GuideFlow',
  dts: true,
  sourcemap: true,
  // NOT `clean: true`. tsup runs the configs in this array concurrently, so a
  // clean here races the subpath builds and can delete .d.ts files they have
  // already written — which then fails verify-pack with no build error at all.
  // The `build` script removes dist/ once, up front, instead.
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  esbuildPlugins: [minifyInjectedCss],
  banner: {
    js: '/* GuideFlow core — MIT License — https://guideflow.dev */',
  },
}, {
  // @guideflow/core/navigation — route-aware target resolution. ~1.6 kB that a
  // single-page tour does not need, so it stays out of the size-gated entry.
  // NOT iife: a second bundle claiming the `GuideFlow` global is nonsense.
  entry: { 'navigation/index': 'src/navigation/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: {
    js: '/* GuideFlow core/navigation — MIT License — https://guideflow.dev */',
  },
}, {
  // @guideflow/core/versioning — derive FlowDefinition.version from a flow's
  // shape. Purely computational; no DOM, no browser globals.
  entry: { versioning: 'src/versioning.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: { js: '/* GuideFlow core/versioning — MIT License */' },
}, {
  // @guideflow/core/targeting — who sees a flow, where, and how often. The
  // data lives in core as types; every rule that acts on it lives here.
  entry: { 'targeting/index': 'src/targeting/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: { js: '/* GuideFlow core/targeting — MIT License */' },
}, {
  // @guideflow/core/selector — build a CSS selector for an element that still
  // resolves after the next deploy. Authoring-time only; nothing in
  // src/index.ts imports it, so dist/index.js is unaffected.
  entry: { selector: 'src/selector.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: { js: '/* GuideFlow core/selector — MIT License */' },
}, {
  // @guideflow/core/authoring — validate a flow, and convert between the linear
  // draft an editor produces and a real FlowDefinition. The only writer and the
  // only reader of a .flow.json file.
  entry: { authoring: 'src/authoring.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: { js: '/* GuideFlow core/authoring — MIT License */' },
}, {
  // @guideflow/core/html — opt-in `content.html` sanitisation. Evicted from the
  // default bundle per ADR-008's condition; see src/html.ts for the rationale.
  entry: { html: 'src/html.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  banner: {
    js: '/* GuideFlow core/html — MIT License — https://guideflow.dev */',
  },
}])
