// ---------------------------------------------------------------------------
// Minimal static file server for the Playwright fixtures.
//
// Rooted at the REPO ROOT, not at fixtures/, so a fixture page can load the
// real built artefacts:
//
//   /apps/e2e/fixtures/index.html   the page under test
//   /packages/core/dist/*           the actual thing we are testing
//
// Deliberately dependency-free (node:http + node:fs), matching scripts/fsx.mjs.
// A bundler here would mean testing the bundler's output, not the package's.
// ---------------------------------------------------------------------------

import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PORT = Number(process.env['E2E_PORT'] ?? 4173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html'

  // Contain every request inside ROOT — a fixture must not be able to read the
  // developer's filesystem via ../../.. even though this only ever runs locally.
  const target = normalize(join(ROOT, pathname))
  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  let stat
  try {
    stat = statSync(target)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${pathname}`)
    return
  }
  if (stat.isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`Not found: ${pathname}`)
    return
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    // Tests rebuild core between runs; never let the browser serve a stale bundle.
    'Cache-Control': 'no-store',
  })
  createReadStream(target).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.warn(`[e2e] serving ${ROOT} at http://127.0.0.1:${PORT}`)
})
