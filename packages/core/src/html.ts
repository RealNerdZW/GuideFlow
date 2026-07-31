/**
 * `@guideflow/core/html` — opt-in HTML sanitisation for `content.html`.
 *
 * ```ts
 * import { createGuideFlow } from '@guideflow/core'
 * import { sanitizeHTML } from '@guideflow/core/html'
 *
 * const gf = createGuideFlow({ sanitizeHTML })
 * ```
 *
 * ## Why this is a separate entry point
 *
 * The sanitiser parses into an inert `<template>` and keeps only an explicit
 * allowlist of elements, attributes and URL schemes. That is the right
 * implementation — ADR-007 replaced a regex denylist that a direct test defeated
 * with 6 of 8 trivial payloads — but it costs ~640 B gzip, and every consumer
 * was paying it, including the majority who only ever set `content.body`
 * (plain text, escaped by the renderer, sanitiser never involved).
 *
 * ADR-008 raised the budget to 14.5 kB for the Phase 6 accessibility work and
 * set an explicit condition on the next raise: move `content.html` support out
 * of the default bundle first. This is that move.
 *
 * ## What happens without it
 *
 * `content.html` is escaped and rendered as **text**, and the renderer warns
 * once. Not passed through — that would be an XSS hole in a library that
 * injects markup into other people's pages. Not dropped — that would be a blank
 * popover with no explanation.
 *
 * ## Passing it explicitly, rather than a side-effect import
 *
 * `import '@guideflow/core/html'` registering itself into a module-level slot
 * would be terser, and would break the moment a bundler handed the subpath its
 * own copy of that module: the registration would land on one instance and the
 * renderer would read another, with no error — just an unexplained fallback to
 * escaped text. An explicit config field has exactly one implementation in play,
 * and it is visible at the call site.
 */
export { sanitizeHTML } from './utils/sanitize.js'
