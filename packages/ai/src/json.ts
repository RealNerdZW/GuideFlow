import type { Step } from '@guideflow/core'

import { validateSteps } from './validation.js'

/**
 * Getting JSON back out of a language model.
 *
 * Every provider used to do `JSON.parse(content)` with nothing but a system
 * prompt ("Always respond with valid JSON only — no prose, no markdown fences")
 * standing between it and a throw. Models ignore that instruction routinely:
 * they wrap output in ```json fences, prepend "Here is the tour you asked
 * for:", or append a closing remark. Every one of those makes `JSON.parse`
 * throw, and the providers' `catch` blocks turn the throw into an empty tour —
 * silently (AUDIT `no-json-mode-hand-parsed`).
 *
 * The real fix is structured output at the API level, and each provider now
 * asks for it. This module is the belt to that pair of braces: it survives the
 * models and endpoints that ignore or do not support the request.
 */

/** The JSON Schema a provider asks the model to conform to, when it can. */
export interface JsonSchemaSpec {
  name: string
  schema: Record<string, unknown>
}

/**
 * Strip Markdown code fences.
 *
 * Handles ```json, ```JSON, bare ```, and an unterminated opening fence — which
 * is what a truncated response looks like, and the case a naive
 * `replace(/```/g, '')` gets wrong by also eating fences inside string values.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed

  // Drop the opening fence and its optional language tag.
  const afterOpen = trimmed.replace(/^```[a-zA-Z]*[ \t]*\r?\n?/, '')
  // Drop a closing fence if there is one. Absent = truncated response; keeping
  // what we have gives `extractJsonValue` a chance at a partial object.
  const closeAt = afterOpen.lastIndexOf('```')
  return (closeAt === -1 ? afterOpen : afterOpen.slice(0, closeAt)).trim()
}

/**
 * Pull the first complete JSON object or array out of a string.
 *
 * Scans with a depth counter rather than a regex, because a regex cannot tell a
 * closing brace inside a string literal from a real one — and step bodies
 * contain braces and quotes often enough for that to matter. Escapes are
 * tracked so `"He said \"hi\""` does not end the string early.
 *
 * Returns null when there is no balanced value, rather than a partial one.
 */
export function extractJsonValue(text: string): string | null {
  const start = text.search(/[[{]/)
  if (start === -1) return null

  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      // Only meaningful inside a string, but harmless outside one.
      escaped = inString
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

/**
 * Parse a model response into a validated value, or return a fallback.
 *
 * Three attempts, cheapest first: parse as-is, parse with fences stripped,
 * parse the first balanced JSON value found anywhere in the text. Whatever
 * parses is then run through the caller's validator, so a well-formed response
 * of the wrong *shape* still lands on the fallback instead of reaching the
 * engine.
 *
 * `onFailure` exists because the old behaviour — a bare `catch { return [] }` —
 * made a broken provider indistinguishable from a page with nothing to tour.
 */
export function parseModelJson<T>(
  text: string,
  validate: (parsed: unknown) => T,
  fallback: T,
  onFailure?: (error: Error, raw: string) => void,
): T {
  const candidates = [text, stripCodeFences(text)]
  const extracted = extractJsonValue(stripCodeFences(text))
  if (extracted !== null) candidates.push(extracted)

  let lastError: Error | null = null
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      return validate(JSON.parse(candidate))
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  onFailure?.(
    lastError ?? new Error('[@guideflow/ai] Model response contained no parseable JSON'),
    text,
  )
  return fallback
}

// ── Schemas ─────────────────────────────────────────────────────────────────
//
// Sent to providers that support structured output. Deliberately loose on the
// fields the engine tolerates being absent, and strict on the ones it does not:
// `validation.ts` is still the authority, and these only reduce how often it
// has to reject something.

export const STEPS_SCHEMA: JsonSchemaSpec = {
  name: 'guideflow_steps',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'content'],
          properties: {
            id: { type: 'string' },
            target: { type: 'string' },
            placement: {
              type: 'string',
              enum: [
                'top', 'top-start', 'top-end',
                'bottom', 'bottom-start', 'bottom-end',
                'left', 'left-start', 'left-end',
                'right', 'right-start', 'right-end',
                'center',
              ],
            },
            content: {
              type: 'object',
              additionalProperties: false,
              required: ['title'],
              properties: {
                title: { type: 'string' },
                body: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

export const INTENT_SCHEMA: JsonSchemaSpec = {
  name: 'guideflow_intent',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'confidence'],
    properties: {
      type: { type: 'string', enum: ['confused', 'stuck', 'exploring', 'engaged'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      element: { type: 'string' },
      duration: { type: 'number' },
    },
  },
}

export const ANSWER_SCHEMA: JsonSchemaSpec = {
  name: 'guideflow_answer',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'highlights'],
    properties: {
      text: { type: 'string' },
      highlights: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
  },
}

// ── Shared provider helpers ─────────────────────────────────────────────────

/**
 * Structured-output modes require an object at the root — OpenAI's
 * `json_schema` rejects a root array outright — so {@link STEPS_SCHEMA} asks
 * for `{ steps: [...] }`. A model that ignores the schema may still return a
 * bare array, so accept both shapes rather than failing on the looser one.
 */
export function unwrapSteps(parsed: unknown): Step[] {
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && 'steps' in parsed) {
    return validateSteps((parsed as { steps: unknown }).steps)
  }
  return validateSteps(parsed)
}

/**
 * Say something when a model response cannot be used.
 *
 * The old `catch { return [] }` made a broken provider indistinguishable from a
 * page with nothing to tour — the most confusing failure mode in this package.
 * Truncated to 200 characters because the raw response can be very large, and
 * because it may contain page content the developer did not intend to log.
 */
export function warnUnparseable(call: string): (error: Error, raw: string) => void {
  return (error, raw) => {
    console.warn(
      `[@guideflow/ai] ${call}: model response was not usable JSON, falling back. ${error.message}`,
      raw.slice(0, 200),
    )
  }
}
