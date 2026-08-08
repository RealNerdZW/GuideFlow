#!/usr/bin/env node
/**
 * Fails when an internal documentation link points at a `#fragment` that does
 * not exist on the target page.
 *
 * **VitePress does not check this.** Its dead-link check validates the page
 * path and stops there, so `/guide/targeting#no-such-heading` builds green and
 * ships a link that silently lands the reader at the top of the page. Two got
 * through before this existed:
 *
 *   - `/guide/spotlight-popover#theming` in `guide/banners.md`, live since the
 *     banner shipped in 7.8b. There is no Theming heading on that page.
 *   - `/guide/targeting#deep-links-gf-tour`, written by hand from the heading
 *     text. The real id is `deep-links-—-gf-tour`: VitePress keeps the EM DASH
 *     from `## Deep links — ?gf_tour=`. Guessing a slug from a heading is
 *     exactly the mistake this catches.
 *
 * It reads the BUILT HTML rather than the markdown, and that is deliberate: the
 * ids in `dist` are the ones a reader's browser resolves, so this measures the
 * outcome instead of re-implementing VitePress's slugify and drifting from it.
 * Same principle as `check-dist-types.mjs` compiling against the emitted
 * `.d.ts`. It therefore has to run AFTER `docs:build`.
 *
 * @author John Mugabe
 * @github RealNerdZW
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DIST = path.resolve(process.argv[2] ?? 'apps/docs/.vitepress/dist')

if (!fs.existsSync(DIST)) {
  console.error('check-docs-anchors: no build at ' + DIST)
  console.error('Run `pnpm docs:build` first — this validates the emitted HTML, not the markdown.')
  process.exit(1)
}

/** @param {string} dir @param {string[]} out */
function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'assets') continue
      htmlFiles(full, out)
    } else if (entry.name.endsWith('.html')) {
      out.push(full)
    }
  }
  return out
}

const pages = htmlFiles(DIST)

/** Site-root-relative page key, e.g. "/guide/banners" — extensionless, index collapsed. */
const keyOf = (file) => {
  let rel = path.relative(DIST, file).split(path.sep).join('/')
  rel = rel.replace(/\.html$/, '')
  rel = rel.replace(/(^|\/)index$/, '$1')
  return '/' + rel.replace(/\/$/, '')
}

/** page key -> Set of element ids on that page */
const idsByPage = new Map()
/** [{ from, href, page, hash }] */
const links = []

const ID_RE = /\sid="([^"]+)"/g
const HREF_RE = /\shref="([^"]+)"/g

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8')
  const key = keyOf(file)

  const ids = new Set()
  for (const m of html.matchAll(ID_RE)) if (m[1]) ids.add(decodeURIComponent(m[1]))
  idsByPage.set(key, ids)

  for (const m of html.matchAll(HREF_RE)) {
    const href = m[1]
    if (href === undefined) continue
    if (!href.includes('#')) continue
    // Skip external, protocol-relative and mailto links.
    if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith('mailto:')) continue

    const [rawPath, ...rest] = href.split('#')
    const hash = rest.join('#')
    if (!hash) continue // a bare "#" is a no-op link, not a broken anchor

    let target
    if (rawPath === '' || rawPath === undefined) {
      target = key // same-page anchor
    } else {
      target = rawPath.replace(/\.html$/, '').replace(/(^|\/)index$/, '$1').replace(/\/$/, '')
      if (!target.startsWith('/')) continue // relative link; VitePress emits absolute
    }
    links.push({ from: key, href, page: target, hash: decodeURIComponent(hash) })
  }
}

// The site is served under a base path (e.g. /GuideFlow/). Strip whatever
// common prefix the emitted hrefs carry, so page keys and link targets agree.
const base = (() => {
  const sample = links.find((l) => l.page !== l.from && !idsByPage.has(l.page))
  if (!sample) return ''
  for (const key of idsByPage.keys()) {
    if (key !== '/' && sample.page.endsWith(key)) return sample.page.slice(0, -key.length)
  }
  return ''
})()

const broken = []
for (const link of links) {
  const target = base && link.page.startsWith(base) ? link.page.slice(base.length) || '/' : link.page
  const ids = idsByPage.get(target)
  if (!ids) continue // page-level dead links are VitePress's job, and it fails the build on them
  if (!ids.has(link.hash)) broken.push({ ...link, target })
}

if (broken.length === 0) {
  console.log(
    'check-docs-anchors: ' + links.length + ' internal anchor link(s) across ' + pages.length + ' page(s), all resolve',
  )
  process.exit(0)
}

console.error('\nBroken anchor link(s) in the docs.\n')
console.error('VitePress validates the page path but NOT the fragment, so these build green')
console.error('and drop the reader at the top of the page instead.\n')

for (const b of broken) {
  console.error('  on ' + b.from)
  console.error('    ' + b.href)
  const ids = idsByPage.get(b.target)
  const near = [...(ids ?? [])].filter((id) => id.includes(b.hash.slice(0, 6)) || b.hash.includes(id.slice(0, 6)))
  if (near.length) console.error('    did you mean: ' + near.slice(0, 3).map((n) => '#' + n).join(', '))
}

console.error('\nHeading ids are generated, so do not hand-write them from the heading text —')
console.error('punctuation survives (an em dash becomes a literal U+2014 in the id). Copy the id')
console.error('out of the built HTML, or link to the page without a fragment.\n')
process.exit(1)
