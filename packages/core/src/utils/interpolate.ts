/**
 * `{{token}}` substitution for step content.
 *
 * `Step.content` already accepts a function, so a **code-authored** flow can
 * personalise freely. A function does not serialise — so a `.flow.json`, which
 * is what the devtools recorder, `@guideflow/mcp` and `guideflow export` all
 * produce and what ADR-014 made the delivery format, carries copy frozen at
 * author time. This is the serialisable half.
 *
 * Deliberately not a template engine. No expressions, no conditionals, no
 * loops: a tour is a handful of sentences, and every one of those features is a
 * new way for author-supplied text to do something surprising inside someone
 * else's application.
 */

/** `{{ name }}` or `{{ name | fallback }}`, with a dotted path for nesting. */
const TOKEN = /\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g

/**
 * Replace every `{{token}}` in `str` with its value from `values`.
 *
 * - `{{plan}}` → the value at `values.plan`
 * - `{{user.name}}` → a dotted path, so a nested context works
 * - `{{plan|your plan}}` → the fallback when the token resolves to
 *   `null`/`undefined`
 * - `{{plan}}` with no value and no fallback → **left as written**, so the
 *   author sees the token they got wrong. An empty gap in a sentence is a worse
 *   failure, because nobody notices it.
 *
 * The result is plain text. Every caller in the engine hands it to a renderer
 * that escapes (`content.title`, `content.body`) or sanitises (`content.html`),
 * so a value containing markup can only ever become visible characters.
 */
export function interpolate(str: string, values: Record<string, unknown>): string {
  // Cheap bail: the overwhelming majority of steps carry no token at all, and
  // this runs on every render.
  if (!str.includes('{{')) return str

  return str.replace(TOKEN, (match, path: string, fallback?: string) => {
    let cursor: unknown = values
    for (const key of path.split('.')) {
      if (cursor === null || typeof cursor !== 'object') { cursor = undefined; break }
      cursor = (cursor as Record<string, unknown>)[key]
    }
    if (cursor === null || cursor === undefined) return fallback ?? match
    // Objects and arrays stringify to noise a user should never see, so they
    // are treated as "no value" rather than rendered as `[object Object]`.
    if (typeof cursor === 'object') return fallback ?? match
    return String(cursor)
  })
}
