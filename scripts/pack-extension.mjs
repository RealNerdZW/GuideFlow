// ---------------------------------------------------------------------------
// Package the built DevTools extension as a loadable .zip.
//
// Until this existed, the only way to obtain the extension was to clone the
// repo, install a package manager, build it, and use Load unpacked — which is
// not a path a non-engineer completes. CI attaches the output as an artifact
// and the release workflow attaches it to the GitHub Release, so "download and
// unzip" becomes possible without a Chrome Web Store listing.
//
// No archiver dependency: Node has zlib, and a ZIP container is a documented
// format. Adding a dependency to produce one file would be the larger cost.
// ---------------------------------------------------------------------------

import { deflateRawSync, crc32 } from 'node:zlib'
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'packages/devtools/dist')
const MANIFEST = join(DIST, 'manifest.json')

if (!existsSync(MANIFEST)) {
  console.error(
    '\n  No built extension found at packages/devtools/dist.\n' +
      '  Run `pnpm --filter @guideflow/devtools build` first.\n',
  )
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const version = manifest.version ?? '0.0.0'
const outPath = join(ROOT, `guideflow-devtools-${version}.zip`)

/** Every file under dist, depth-first, as repo-relative POSIX paths. */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

const files = walk(DIST).sort()
if (files.length === 0) {
  console.error('\n  packages/devtools/dist is empty.\n')
  process.exit(1)
}

// A Chrome extension zip must have manifest.json at the ROOT of the archive,
// not inside a directory — Load unpacked and the Web Store both reject a
// nested layout, and the failure message names neither cause.
const entries = files.map((full) => ({
  name: relative(DIST, full).split('\\').join('/'),
  data: readFileSync(full),
}))

if (!entries.some((e) => e.name === 'manifest.json')) {
  console.error('\n  manifest.json is not at the archive root. Refusing to write a broken zip.\n')
  process.exit(1)
}

// ── Minimal ZIP writer (store or deflate, no directory entries) ────────────

const localParts = []
const centralParts = []
let offset = 0

for (const entry of entries) {
  const nameBytes = Buffer.from(entry.name, 'utf8')
  const compressed = deflateRawSync(entry.data, { level: 9 })
  // Only use deflate when it actually helps; a tiny file often grows.
  const useDeflate = compressed.length < entry.data.length
  const body = useDeflate ? compressed : entry.data
  const method = useDeflate ? 8 : 0
  const crc = crc32(entry.data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // local file header signature
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0, 6) // flags
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(0, 10) // mod time — zeroed, see the note below
  local.writeUInt16LE(0x21, 12) // mod date: 1980-01-01
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(body.length, 18)
  local.writeUInt32LE(entry.data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  local.writeUInt16LE(0, 28) // extra length
  localParts.push(local, nameBytes, body)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0, 8) // flags
  central.writeUInt16LE(method, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0x21, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(body.length, 20)
  central.writeUInt32LE(entry.data.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt16LE(0, 30) // extra
  central.writeUInt16LE(0, 32) // comment
  central.writeUInt16LE(0, 34) // disk
  central.writeUInt16LE(0, 36) // internal attrs
  central.writeUInt32LE(0, 38) // external attrs
  central.writeUInt32LE(offset, 42)
  centralParts.push(central, nameBytes)

  offset += local.length + nameBytes.length + body.length
}

const centralBuf = Buffer.concat(centralParts)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(0, 4) // disk
end.writeUInt16LE(0, 6) // disk with central dir
end.writeUInt16LE(entries.length, 8)
end.writeUInt16LE(entries.length, 10)
end.writeUInt32LE(centralBuf.length, 12)
end.writeUInt32LE(offset, 16)
end.writeUInt16LE(0, 20) // comment length

writeFileSync(outPath, Buffer.concat([...localParts, centralBuf, end]))

// Timestamps are fixed at 1980-01-01 and the file list is sorted, so the same
// dist always produces a byte-identical zip. That makes the artifact
// diffable, and it means a rebuild that changes nothing does not look like a
// change.
const size = statSync(outPath).size
console.log(
  `\n  ✓ ${relative(ROOT, outPath)} — ${entries.length} files, ${(size / 1024).toFixed(1)} kB\n` +
    `    Unzip it, then load it at chrome://extensions with Developer mode on.\n`,
)
