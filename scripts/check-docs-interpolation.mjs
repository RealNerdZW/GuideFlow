#!/usr/bin/env node
/**
 * Fails when a VitePress markdown page contains `{{ ... }}` that Vue will treat
 * as a template expression.
 *
 * Why this is not covered by `vitepress build`:
 *
 *   - `{{user.name}}` DOES break the build — Vue compiles it, evaluates
 *     `user.name` against an undefined `user`, and the SSR render throws.
 *   - `{{plan}}` does NOT. It compiles fine, resolves to undefined, and renders
 *     as an **empty string**. The page ships with a blank where the author
 *     wrote a token, and nothing anywhere reports it.
 *
 * The second case is the dangerous one, and it is why this check exists rather
 * than relying on the build. Five of them were live on the two pages that
 * document token syntax — including `<a href="/r?next={{to}}">` in the security
 * section, which rendered as `href="/r?next="`, deleting the very token the
 * surrounding paragraph warns you about.
 *
 * A token is considered safe when it is inside a fenced code block, inside a
 * `::: v-pre` container, or inside an element carrying `v-pre` on the same line
 * (the `<code v-pre>{{token}}</code>` idiom used for inline mentions).
 * Frontmatter is skipped: it is parsed as YAML for meta tags, never compiled as
 * a template.
 *
 * @author John Mugabe
 * @github RealNerdZW
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(process.argv[2] ?? 'apps/docs')
const FENCE = String.fromCharCode(96, 96, 96)
const SKIP_DIRS = new Set(['node_modules', 'dist', 'cache', '.temp', '.vitepress'])

/** @param {string} dir @param {string[]} out */
function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      collect(full, out)
    } else if (entry.name.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

const offences = []

for (const file of collect(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  let inFence = false
  let inVPre = false
  let inFrontmatter = false

  lines.forEach((line, i) => {
    const trimmed = line.trimStart()

    // Frontmatter: only when --- is the very first line of the file.
    if (trimmed === '---' && (i === 0 || inFrontmatter)) {
      inFrontmatter = i === 0
      return
    }
    if (inFrontmatter) return

    if (trimmed.startsWith(FENCE)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    if (/^:::\s*v-pre\b/.test(trimmed)) {
      inVPre = true
      return
    }
    if (inVPre) {
      if (/^:::\s*$/.test(trimmed)) inVPre = false
      return
    }

    if (!line.includes('{{')) return
    // The inline escape hatch: <code v-pre>{{token}}</code> on one line.
    if (line.includes('v-pre')) return

    offences.push({
      file: path.relative(process.cwd(), file).split(path.sep).join('/'),
      line: i + 1,
      text: line.trim(),
    })
  })
}

if (offences.length === 0) {
  console.log('check-docs-interpolation: no unescaped {{ }} in ' + ROOT)
  process.exit(0)
}

console.error('\nUnescaped Vue interpolation in the docs.\n')
console.error('Vue compiles {{ ... }} in markdown as an expression. It will either')
console.error('throw during SSR or — worse — silently render as an empty string.\n')

for (const o of offences) {
  console.error('  ' + o.file + ':' + o.line)
  console.error('    ' + o.text.slice(0, 120))
}

console.error('\nFixes, in order of preference:')
console.error('  - a fenced code block, if you are showing a snippet')
console.error('  - ::: v-pre  …  :::        around a table or a block')
console.error('  - <code v-pre>{{token}}</code>   for a single inline mention')
console.error('')
process.exit(1)
