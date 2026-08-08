#!/usr/bin/env node
/**
 * Type-check a REAL consumer against the BUILT `packages/core/dist`.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────
 *
 * `pnpm type-check` cannot catch the class of bug this guards, by construction.
 * Every caller inside this repo — apps/demo, the unit tests, apps/e2e/fixtures,
 * the sibling packages — resolves `@guideflow/core` and `@guideflow/core/*`
 * through `tsconfig` `paths` to `packages/core/src`. One copy of the type graph,
 * so everything unifies. A published consumer resolves through the package
 * `exports` map to `dist/*.d.ts`, which is a completely different graph.
 *
 * And that graph is built by rollup-dts, once per tsup config, with `dts: true`
 * on all seven. rollup-dts bundles per entry: it does not emit an import back
 * into the main entry's declarations, it INLINES the whole transitive type graph
 * into each subpath file. `dist/targeting/index.d.ts` has zero `import`
 * statements and re-declares `I18nRegistry`, `ProgressStore` and `EventEmitter`.
 *
 * Duplicated *interfaces* unify structurally and nobody notices. A duplicated
 * *class with private members is NOMINALLY typed*, so the copy in
 * `targeting/index.d.ts` and the copy in `index.d.ts` are permanently
 * incompatible — and passing a `GuideFlowInstance` from `@guideflow/core` into
 * `createTargeting` from `@guideflow/core/targeting` is a TS2345 that no
 * in-repo test can see. Shipped that way in 0.1.9.
 *
 * So: build a scratch package that resolves the way npm does, and compile it.
 *
 * ── What it checks ─────────────────────────────────────────────────────────────
 *
 * One consumer file per subpath, under BOTH `moduleResolution: node16` module
 * kinds — an ESM consumer reading `dist/*.d.ts`, and a CJS consumer reading
 * `dist/*.d.cts`. Both are generated separately by tsup and both ship, so a fix
 * that only lands in one is not a fix.
 *
 * `skipLibCheck` is deliberately FALSE. The entire point is to check the .d.ts.
 *
 * Usage:
 *   node scripts/check-dist-types.mjs            # requires a built dist
 *   node scripts/check-dist-types.mjs --keep     # leave the scratch dir for inspection
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CORE = join(ROOT, 'packages', 'core')
const SCRATCH = join(CORE, '.dist-types-check')
const KEEP = process.argv.includes('--keep')

/**
 * Every consumer, keyed by subpath.
 *
 * `body` is written into BOTH an ESM and a CJS file. Keep the source identical
 * between the two so a divergence in the output is a divergence in the .d.ts,
 * not in the fixture.
 *
 * The two that matter are `targeting` and `navigation`, because they are the
 * only subpaths that accept a live instance built by `@guideflow/core`. The
 * other four are here because "they take no host so they are probably fine" is
 * exactly the reasoning that let 0.1.9 ship.
 */
const CONSUMERS = [
  {
    name: 'entry',
    body: `
import { createGuideFlow } from '@guideflow/core'
const gf = createGuideFlow({})
void gf.start('x')
`,
  },
  {
    name: 'targeting',
    body: `
import { createGuideFlow } from '@guideflow/core'
import { createTargeting, startFromUrl } from '@guideflow/core/targeting'

const gf = createGuideFlow({})
// THE regression. A nominal duplicate of I18nRegistry/ProgressStore/EventEmitter
// inlined into targeting/index.d.ts makes this a TS2345.
const targeting = createTargeting(gf)
targeting.install()
void startFromUrl(gf)

// Same again with a custom context, which is the shape every real app uses.
interface Ctx { userId: string; plan: string; [k: string]: unknown }
const typed = createGuideFlow<Ctx>({ context: { userId: 'u1', plan: 'pro' } })
void createTargeting(typed).autoStart('load')
void startFromUrl(typed)
`,
  },
  {
    name: 'navigation',
    body: `
import { createGuideFlow } from '@guideflow/core'
import { advanceOn, createNavigation, matchRoute, waitForElement, watchHistory } from '@guideflow/core/navigation'

const gf = createGuideFlow({ navigation: createNavigation({ waitForTarget: 1000 }) })
const stop = advanceOn(gf, { save: 'click', plan: { event: 'change', action: 'CHOSE_PLAN' } })
stop()
void matchRoute('/billing/**')
void waitForElement('#x')
watchHistory(() => {})()

// A custom context, passed to the helper that takes a live instance. This is
// the shape that would break if AdvanceOnHost were ever "simplified" back to
// naming GuideFlowInstance.
interface Ctx { userId: string; plan: string; [k: string]: unknown }
const typed = createGuideFlow<Ctx>({ navigation: createNavigation() })
advanceOn(typed, { a: 'click' })()

// NOT exercised, deliberately: \`createNavigation<Ctx>()\`.
//
// It does not compile, and it does not compile through \`src\` either — MEASURED
// both ways, so it is NOT the dist-inlining bug this script guards. It is a
// separate, pre-existing defect: \`GuideFlowConfig\` is not generic, so
// \`navigation\` is pinned to \`NavigationAdapter<GuidanceContext>\`, while
// \`Step<TContext>\` is invariant (\`showIf\` and the function \`target\` form consume
// TContext; \`ResolveTargetRequest.context\` produces it) so neither direction of
// the method-shorthand bivariance rescues it. Fixing it means making
// \`GuideFlowConfig\` generic, which ripples through \`RendererContract.onInit\`,
// \`configure()\` and all three framework adapters — a deliberate API change with
// its own ADR, not a line in this fixture. Until then the generic parameter on
// \`createNavigation\` is unusable and the untyped call above is the supported
// form (which is also the only form the docs show).
`,
  },
  {
    name: 'selector',
    body: `
import { buildSelector } from '@guideflow/core/selector'
void buildSelector
`,
  },
  {
    name: 'authoring',
    body: `
import { validateFlow } from '@guideflow/core/authoring'
void validateFlow({ id: 'f', initial: 's', states: {} })
`,
  },
  {
    name: 'html',
    body: `
import { createGuideFlow } from '@guideflow/core'
import { sanitizeHTML } from '@guideflow/core/html'
// Passed through config, so this also proves the two graphs agree on the option.
void createGuideFlow({ sanitizeHTML })
`,
  },
  {
    name: 'versioning',
    body: `
import { flowFingerprint } from '@guideflow/core/versioning'
// Pick<FlowDefinition, 'initial' | 'states'> — no id, on purpose: the
// fingerprint must not move when a flow is renamed.
void flowFingerprint({ initial: 's', states: {} })
`,
  },
]

function fail(message) {
  console.error(`\n[31m✖ ${message}[0m`)
  process.exit(1)
}

// ── Preconditions ────────────────────────────────────────────────────────────

if (!existsSync(join(CORE, 'dist', 'index.d.ts'))) {
  fail('packages/core/dist is not built. Run `pnpm --filter @guideflow/core build` first.')
}

/**
 * Refuse to check a dist that is older than the source it claims to describe.
 *
 * MEASURED, and it cost real time: `turbo` restored a cached `dist/` from an
 * earlier commit, so this script reported the pre-fix failure against
 * already-fixed source. A guard that checks a stale artefact is worse than no
 * guard — it reports on code nobody is running, in both directions.
 */
function newestMtime(dir, filter) {
  let newest = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      newest = Math.max(newest, newestMtime(full, filter))
    } else if (filter(entry.name)) {
      newest = Math.max(newest, statSync(full).mtimeMs)
    }
  }
  return newest
}

const newestSrc = newestMtime(join(CORE, 'src'), (n) => n.endsWith('.ts'))
const newestDts = newestMtime(join(CORE, 'dist'), (n) => n.endsWith('.d.ts') || n.endsWith('.d.cts'))
if (newestSrc > newestDts) {
  fail(
    'packages/core/dist is OLDER than packages/core/src — the declarations do not\n' +
    '  describe the current source, so this check would report on stale output.\n' +
    '  Run `pnpm --filter @guideflow/core build` and try again.',
  )
}

// ── Scratch package ──────────────────────────────────────────────────────────

rmSync(SCRATCH, { recursive: true, force: true })
mkdirSync(join(SCRATCH, 'node_modules', '@guideflow'), { recursive: true })
mkdirSync(join(SCRATCH, 'src'), { recursive: true })

// A junction, not a file symlink: on Windows a directory symlink needs elevation
// or developer mode, and a junction needs neither. Node picks the right syscall
// from the 'junction' type on Windows and ignores it elsewhere.
symlinkSync(CORE, join(SCRATCH, 'node_modules', '@guideflow', 'core'), 'junction')

// `type: module` makes .ts an ESM file and .cts a CommonJS one, which is what
// selects `exports.import` vs `exports.require` — i.e. .d.ts vs .d.cts.
writeFileSync(
  join(SCRATCH, 'package.json'),
  `${JSON.stringify({ name: 'gf-dist-types-check', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`,
)

writeFileSync(
  join(SCRATCH, 'tsconfig.json'),
  `${JSON.stringify(
    {
      compilerOptions: {
        // node16 is the resolution mode that reads the `exports` map, and the
        // one a modern consumer actually uses. `bundler` would too, but node16
        // additionally validates the ESM/CJS split.
        module: 'node16',
        moduleResolution: 'node16',
        target: 'es2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        strict: true,
        // FALSE on purpose. Checking the shipped .d.ts is the entire job.
        skipLibCheck: false,
        noEmit: true,
        types: [],
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`,
)

for (const { name, body } of CONSUMERS) {
  writeFileSync(join(SCRATCH, 'src', `${name}.ts`), `${body.trimStart()}`)
  // The CJS half. Same source; `.cts` flips the resolution mode, so it reads
  // dist/*.d.cts through `exports.require`.
  writeFileSync(join(SCRATCH, 'src', `${name}.cts`), `${body.trimStart()}`)
}

// ── Compile ──────────────────────────────────────────────────────────────────

const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
let output = ''
let ok = true
try {
  output = execFileSync(process.execPath, [tsc, '--project', SCRATCH], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (err) {
  ok = false
  output = `${err.stdout ?? ''}${err.stderr ?? ''}`
}

if (!KEEP) rmSync(SCRATCH, { recursive: true, force: true })

if (!ok) {
  console.error(output.trim())
  fail(
    'A consumer cannot type-check against packages/core/dist.\n' +
    '  This is what `pnpm type-check` cannot see: in-repo callers resolve through\n' +
    '  tsconfig paths to src, so they share one copy of the type graph.\n' +
    '  Re-run with --keep to inspect the scratch package.',
  )
}

console.log(`✓ dist type-check: ${CONSUMERS.length} subpath consumers × { esm, cjs } compile clean against packages/core/dist`)
