// ---------------------------------------------------------------------------
// verify-pack — check that what npm would publish matches each package's
// exports map.
//
// Runs `npm pack --dry-run --json` per publishable package and asserts that
// every file path referenced by "exports" / "main" / "module" / "types" / "bin"
// is actually in the tarball.
//
// This exists because @guideflow/core declares a "./styles" subpath that only
// exists because the build copies src/styles into dist. A build script that
// silently failed (as the POSIX-only `cp -r` did on Windows) would publish a
// package whose documented import throws for every consumer, and nothing in the
// pipeline would notice.
//
// Usage: node scripts/verify-pack.mjs
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// See the execFileSync call below: DEP0190 does not apply to static arguments.
process.noDeprecation = true

/** Packages that are actually published to npm (devtools is private). */
const PACKAGES = ['core', 'react', 'vue', 'svelte', 'ai', 'analytics', 'cli', 'checklist', 'banner']

let failed = 0
/** name → version, for the fixed-group equality check after the loop. */
const versions = new Map()

/** Collect every concrete file path a manifest promises consumers. */
function declaredPaths(pkg) {
  const out = new Set()

  const addIfConcrete = (value) => {
    if (typeof value !== 'string') return
    if (!value.startsWith('./') && !value.startsWith('dist/')) return
    // Wildcard subpaths (e.g. "./styles/*") cannot be checked file-by-file;
    // the directory check below covers them.
    if (value.includes('*')) return
    out.add(value.replace(/^\.\//, ''))
  }

  const walkExports = (node) => {
    if (typeof node === 'string') return addIfConcrete(node)
    if (node && typeof node === 'object') Object.values(node).forEach(walkExports)
  }

  walkExports(pkg.exports)
  addIfConcrete(pkg.main)
  addIfConcrete(pkg.module)
  addIfConcrete(pkg.types)
  if (pkg.bin && typeof pkg.bin === 'object') Object.values(pkg.bin).forEach(addIfConcrete)
  else addIfConcrete(pkg.bin)

  return [...out]
}

/** Wildcard export subpaths, reduced to the directory that must be present. */
function declaredDirs(pkg) {
  const out = new Set()
  const walk = (node) => {
    if (typeof node === 'string' && node.includes('*')) {
      const dir = node.replace(/^\.\//, '').split('*')[0].replace(/\/$/, '')
      if (dir) out.add(dir)
    } else if (node && typeof node === 'object') {
      Object.values(node).forEach(walk)
    }
  }
  walk(pkg.exports)
  return [...out]
}

for (const name of PACKAGES) {
  const dir = join(ROOT, 'packages', name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) {
    console.error(`✗ packages/${name}: no package.json`)
    failed++
    continue
  }

  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
  versions.set(pkg.name, pkg.version)

  let packed
  try {
    // shell:true is required on Windows — since Node 20, spawning a .cmd
    // without it fails with EINVAL. DEP0190 warns that shell args are
    // concatenated unescaped; every argument here is a static literal, so
    // there is nothing to escape. The warning is suppressed at the top of the
    // file rather than left to pollute CI output.
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    packed = JSON.parse(raw)
  } catch (err) {
    console.error(`✗ ${pkg.name}: npm pack failed\n${err.stderr ?? err.message}`)
    failed++
    continue
  }

  const files = new Set((packed[0]?.files ?? []).map((f) => f.path.replace(/\\/g, '/')))

  const missing = declaredPaths(pkg).filter((p) => !files.has(p))
  const missingDirs = declaredDirs(pkg).filter(
    (d) => ![...files].some((f) => f.startsWith(`${d}/`)),
  )

  // A `workspace:` range in peerDependencies is a publish-time hazard: whether
  // it gets rewritten to a real semver range depends on which publisher runs,
  // and if it survives, every consumer install fails on an unresolvable peer.
  // An explicit range costs nothing and removes the question.
  const badPeers = Object.entries(pkg.peerDependencies ?? {})
    .filter(([, range]) => String(range).startsWith('workspace:'))
    .map(([dep]) => dep)

  if (missing.length || missingDirs.length || badPeers.length) {
    failed++
    console.error(`✗ ${pkg.name}`)
    for (const p of missing) console.error(`    exports references "${p}" — not in tarball`)
    for (const d of missingDirs) console.error(`    exports references "${d}/*" — directory not in tarball`)
    for (const d of badPeers) console.error(`    peerDependencies["${d}"] uses the workspace: protocol — not publishable`)
  } else {
    console.log(`✓ ${pkg.name} — ${files.size} files, ${packed[0]?.size ?? '?'} bytes`)
  }
}

// Every member of the changesets `fixed` group must carry the SAME version.
//
// `matchFixedConstraint` takes the highest version across the whole group and
// forces it onto every member. A new package scaffolded at npm's default
// 1.0.0 therefore takes core, react, vue, svelte, ai, analytics, cli and
// devtools to 1.x on the next release — and because every peer range is
// ">=0.1.9 <1.0.0", each peer dependent then falls out of range and
// `onlyUpdatePeerDependentsWhenOutOfRange` majors them again. Nothing else in
// CI catches this, and by the time it shows up the release has happened.
const distinct = [...new Set(versions.values())]
if (distinct.length > 1) {
  failed++
  console.error('\n✗ changesets fixed group carries more than one version:')
  for (const [name, version] of versions) console.error(`    ${name} @ ${version}`)
  console.error('    All @guideflow/* packages release together and must share a version.')
}

if (failed > 0) {
  console.error(`\n${failed} package(s) would publish a broken tarball.`)
  process.exit(1)
}
console.log(`\nAll publishable packages verified at ${distinct[0]}.`)
