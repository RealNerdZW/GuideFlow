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

  // `.flow.json` is the one thing served here that a TEST wants cached and
  // conditionally revalidated — it is the artefact a host would serve, and the
  // remote-flow spec asserts on 304s. Everything else keeps `no-store`, because
  // its stated reason (tests rebuild core between runs; never serve a stale
  // bundle) still holds and does not apply to a flow document.
  const isFlowFile = target.endsWith('.flow.json')
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`

  if (isFlowFile && req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }).end()
    return
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': stat.size,
    ...(isFlowFile
      // `no-cache` means "revalidate every time", NOT "do not store" — which is
      // exactly what a flow document wants: always fresh, but a 304 when it has
      // not changed.
      ? { ETag: etag, 'Cache-Control': 'no-cache' }
      : { 'Cache-Control': 'no-store' }),
  })
  createReadStream(target).pipe(res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.warn(`[e2e] serving ${ROOT} at http://127.0.0.1:${PORT}`)
})
