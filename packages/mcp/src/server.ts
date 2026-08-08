// ---------------------------------------------------------------------------
// The GuideFlow MCP server.
//
// The inversion `MCP-AND-SKILLS.md` §3 asks for: instead of shipping an LLM
// call inside the browser bundle with the customer's API key (which is what
// `@guideflow/ai` still is), expose the AUTHORING ENGINE as tools and let
// whatever agent the operator already trusts do the generating.
//
// Two consequences, and both are the point:
//
//   1. **This server holds no credentials and makes no network calls.** There
//      is nothing to leak. `author_flow` does not call a model — the client IS
//      the model. It converts and validates what the model wrote.
//   2. **Every tool is read-only.** Nothing writes a file. Authoring returns
//      the exact bytes to write and lets the client's own file tools do it,
//      under whatever permission model the operator already has.
//
// The validator behind `validate_flow` is `@guideflow/core/authoring`'s — the
// same one `guideflow validate` and the DevTools Recorder use. ADR-012's "one
// engine" promise, reaching one more surface.
//
// `extract_strings` and `translate_flow` are the same inversion applied to
// localisation: no translation service, no key, no network. The model
// translates; these two say which strings exist and whether what came back will
// still run. See `catalogue.ts`.
// ---------------------------------------------------------------------------

import type { FlowDefinition } from '@guideflow/core'
import {
  draftToFlow,
  explainNotLinear,
  stringifyFlowFile,
  validateFlow,
  type FlowDraft,
} from '@guideflow/core/authoring'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { checkCatalogue, extractStrings, type CatalogueIssue } from './catalogue.js'
import { findByFlowId, listFlows, readFlowFile } from './flows.js'
import { OutsideRootError } from './root.js'

/** Kept in step with the package version by the build; see version.ts. */
export const SERVER_NAME = 'guideflow-mcp-server'

/**
 * A tool result the model can act on.
 *
 * `structuredContent` carries the machine-readable payload; the text block is
 * the same object as JSON so clients that render only text still show
 * something useful rather than an empty response.
 */
function ok(payload: Record<string, unknown>): {
  content: Array<{ type: 'text'; text: string }>
  structuredContent: Record<string, unknown>
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  }
}

/**
 * An error the model can recover from.
 *
 * `isError` rather than a thrown exception, so the client sees a tool failure
 * with a message rather than a transport error — and the message always says
 * what to do next, which is the difference between an agent retrying correctly
 * and an agent giving up.
 */
function fail(message: string): {
  content: Array<{ type: 'text'; text: string }>
  isError: true
} {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function describe(error: unknown): string {
  if (error instanceof OutsideRootError) return error.message
  const err = error as NodeJS.ErrnoException
  if (err?.code === 'ENOENT') {
    return `No such file: ${err.path ?? 'unknown'}. Run guideflow_list_flows to see what exists.`
  }
  if (err?.code === 'EISDIR') return 'That path is a directory, not a flow file.'
  if (err?.code === 'EACCES') return `Permission denied reading ${err.path ?? 'that path'}.`
  return err?.message ?? String(error)
}

/**
 * Everything a client renders as an issue.
 *
 * Structural rather than `FlowIssue`, so the catalogue tools' own issue codes —
 * a separate closed union, in a separate namespace — go through the same
 * formatter and arrive looking identical.
 */
interface RenderableIssue {
  code: string
  severity: string
  path: string
  message: string
  hint: string
}

/** Issues, trimmed to what a model needs to act. */
function issueLines(issues: readonly RenderableIssue[]): Array<Record<string, unknown>> {
  return issues.map((i) => ({
    code: i.code,
    severity: i.severity,
    path: i.path,
    message: i.message,
    hint: i.hint,
  }))
}

/** A flow file resolved from an id, or a message saying why it was not. */
function locateByFlowId(root: string, flowId: string): { path: string } | { message: string } {
  const matches = findByFlowId(root, flowId)
  if (matches.length === 0) {
    return {
      message: `No flow with id "${flowId}" under ${root}. Run guideflow_list_flows to see what exists.`,
    }
  }
  if (matches.length > 1) {
    return {
      message:
        `Ambiguous: ${matches.length} files declare the id "${flowId}" — ` +
        `${matches.map((m) => m.path).join(', ')}. Pass one of them as \`path\`.`,
    }
  }
  return { path: matches[0]?.path as string }
}

type FlowSource =
  | { ok: true; flow: FlowDefinition; path: string | null }
  | { ok: false; message: string }

/**
 * The one flow a tool was pointed at: from disk by path or id, or inline.
 *
 * Inline matters for the catalogue tools specifically — a model that has just
 * authored a flow has it in hand and has not written it anywhere yet, and
 * making it save a file first to extract its strings would be a round trip for
 * nothing.
 *
 * A flow that does not validate is REFUSED rather than half-processed. Every
 * catalogue key is a step or state id, so an id the validator would have
 * rejected produces a catalogue that quietly matches nothing.
 */
function resolveFlowSource(
  root: string,
  args: { path?: string | undefined; flowId?: string | undefined; flow?: unknown },
): FlowSource {
  const given = [args.path, args.flowId, args.flow].filter((v) => v !== undefined).length
  if (given !== 1) {
    return { ok: false, message: 'Pass exactly one of `path`, `flowId` or `flow`.' }
  }

  if (args.flow !== undefined) {
    const raw = args.flow
    const input =
      raw !== null && typeof raw === 'object' && 'gfFlowFile' in raw
        ? (raw as unknown as { flow: unknown }).flow
        : raw
    const result = validateFlow(input)
    if (!result.flow) {
      return {
        ok: false,
        message:
          `That flow does not validate, so its step and state ids cannot be trusted: ` +
          `${result.errors[0]?.message ?? 'unknown error'} ` +
          'Run guideflow_validate_flow for the full list.',
      }
    }
    return { ok: true, flow: result.flow, path: null }
  }

  try {
    let target = args.path
    if (target === undefined && args.flowId !== undefined) {
      const located = locateByFlowId(root, args.flowId)
      if ('message' in located) return { ok: false, message: located.message }
      target = located.path
    }
    const result = readFlowFile(root, target as string)
    if (!result.flow) {
      return {
        ok: false,
        message:
          `${result.path} does not validate, so its step and state ids cannot be trusted: ` +
          `${result.issues.find((i) => i.severity === 'error')?.message ?? 'unknown error'} ` +
          'Run guideflow_get_flow for the full list.',
      }
    }
    return { ok: true, flow: result.flow, path: result.path }
  } catch (error) {
    return { ok: false, message: describe(error) }
  }
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  // Nothing here touches the network. The only external world is the operator's
  // own filesystem, under a fixed root.
  openWorldHint: false,
} as const

export function createServer(root: string, version: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version })

  // ── list ────────────────────────────────────────────────────────────────

  server.registerTool(
    'guideflow_list_flows',
    {
      title: 'List GuideFlow flow files',
      description: `List every \`*.flow.json\` under the server's root directory, with a one-line health summary for each.

There is no hosted flow store — a GuideFlow flow is a static file, so this walks the operator's directory. Start here when you do not know what tours a project has.

Args:
  - limit (number): Maximum flows to return, 1-200 (default: 50)
  - offset (number): How many to skip, for pagination (default: 0)

Returns:
  {
    "root": string,             // absolute root this server is scoped to
    "total": number,            // flow files found
    "count": number,            // returned in this response
    "offset": number,
    "has_more": boolean,
    "next_offset": number,      // present when has_more
    "flows": [
      {
        "id": string | null,    // the flow's own id; null when unparseable
        "path": string,         // relative to root, forward slashes
        "valid": boolean,       // no ERRORS. warnings do not clear it
        "errorCount": number,
        "warningCount": number,
        "stepCount": number | null,   // steps on the NEXT path from initial
        "fingerprint": string | null  // structural hash; changes = a republish
      }
    ]
  }

Examples:
  - Use when: "what onboarding does this repo have?"
  - Use when: you need a path to pass to guideflow_get_flow
  - Don't use when: you already have the flow JSON (use guideflow_validate_flow)

Notes:
  - node_modules, .git, dist, build, coverage and dotted directories are skipped.
  - The walk is bounded to 8 levels and 500 files.`,
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50).describe('Maximum flows to return'),
        offset: z.number().int().min(0).default(0).describe('How many to skip'),
      },
      annotations: READ_ONLY,
    },
    ({ limit, offset }) => {
      try {
        const all = listFlows(root)
        const page = all.slice(offset, offset + limit)
        const hasMore = offset + page.length < all.length
        return ok({
          root,
          total: all.length,
          count: page.length,
          offset,
          has_more: hasMore,
          ...(hasMore && { next_offset: offset + page.length }),
          flows: page,
        })
      } catch (error) {
        return fail(describe(error))
      }
    },
  )

  // ── get ─────────────────────────────────────────────────────────────────

  server.registerTool(
    'guideflow_get_flow',
    {
      title: 'Read one GuideFlow flow file',
      description: `Read and parse a single flow file, returning the FlowDefinition plus the derived facts that are easy to get wrong by eye.

A flow is a finite state machine, not a step array, so "how many steps does this tour have" is a graph walk rather than a length. This does that walk for you.

Args:
  - path (string): Path to the flow file, relative to the server root. Mutually exclusive with flowId.
  - flowId (string): The flow's own \`id\`. Resolved by scanning; fails if two files declare it.

Returns:
  {
    "path": string,
    "valid": boolean,
    "issues": [{ "code", "severity", "path", "message", "hint" }],
    "fingerprint": string | null,   // structural hash (see guideflow_validate_flow)
    "stepCount": number | null,     // steps on the NEXT path from initial
    "notLinear": string | null,     // why this flow is not a simple step list
    "flow": object | null           // the FlowDefinition, when it parsed
  }

Examples:
  - Use when: "show me the welcome tour" -> { flowId: "welcome" }
  - Use when: you have a path from guideflow_list_flows -> { path: "tours/welcome.flow.json" }

Error Handling:
  - "No such file" when the path does not exist; run guideflow_list_flows.
  - "Refused: … outside the server's root" when the path escapes the root.
  - Names every match when a flowId is ambiguous, so you can pick a path.`,
      inputSchema: {
        path: z.string().min(1).optional().describe('Path relative to the server root'),
        flowId: z.string().min(1).optional().describe("The flow's own id"),
      },
      annotations: READ_ONLY,
    },
    ({ path, flowId }) => {
      if ((path === undefined) === (flowId === undefined)) {
        return fail('Pass exactly one of `path` or `flowId`.')
      }
      try {
        let target = path
        if (target === undefined && flowId !== undefined) {
          const located = locateByFlowId(root, flowId)
          if ('message' in located) return fail(located.message)
          target = located.path
        }
        const result = readFlowFile(root, target as string)
        return ok({
          path: result.path,
          valid: result.valid,
          issues: issueLines(result.issues),
          fingerprint: result.fingerprint,
          stepCount: result.stepCount,
          notLinear: result.flow ? explainNotLinear(result.flow) : null,
          flow: result.flow,
        })
      } catch (error) {
        return fail(describe(error))
      }
    },
  )

  // ── validate ────────────────────────────────────────────────────────────

  server.registerTool(
    'guideflow_validate_flow',
    {
      title: 'Validate a GuideFlow flow',
      description: `Check a FlowDefinition against the engine's real rules and return every problem with a fix.

This is the same validator \`guideflow validate\` and the DevTools Recorder use — not a re-implementation — so a flow that passes here is one the engine will run.

It catches, among others: a transition naming a state that does not exist (which makes the engine truncate the tour AND record it as completed, so it never shows again), duplicate step ids, unreachable states, an empty title, and a missing \`final: true\` (a warning, not an error — a flow completes when there is nothing left to render).

Args:
  - flow (object): A FlowDefinition, or a { gfFlowFile, flow } envelope.

Returns:
  {
    "valid": boolean,          // true when there are no ERRORS
    "errorCount": number,
    "warningCount": number,
    "issues": [
      {
        "code": string,        // stable; assert on this, not on message
        "severity": "error" | "warning",
        "path": string,        // e.g. "states.welcome.steps[1].target"
        "message": string,
        "hint": string         // one imperative sentence naming the fix
      }
    ]
  }

Examples:
  - Use when: you just wrote a flow and want to know if it will run
  - Use when: a tour "ends early" — a dangling transition is the usual cause
  - Don't use when: you want to read a file (use guideflow_get_flow)

Notes:
  - Selector rules are skipped, not failed: there is no DOM in this process.
  - Warnings never set \`valid\` to false and never clear it.`,
      inputSchema: {
        flow: z.unknown().describe('A FlowDefinition or a { gfFlowFile, flow } envelope'),
      },
      annotations: READ_ONLY,
    },
    ({ flow }) => {
      // Accept either shape. An agent that just read a file has the envelope;
      // one that just wrote a flow has the flow. Requiring the right one would
      // be a round trip for nothing.
      const input =
        flow !== null && typeof flow === 'object' && 'gfFlowFile' in flow
          ? (flow as unknown as { flow: unknown }).flow
          : flow
      const result = validateFlow(input)
      return ok({
        valid: result.valid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        issues: issueLines(result.issues),
      })
    },
  )

  // ── author ──────────────────────────────────────────────────────────────

  server.registerTool(
    'guideflow_author_flow',
    {
      title: 'Turn a step list into a validated flow file',
      description: `Convert a linear list of steps into a valid FlowDefinition and return the exact bytes to save as a \`.flow.json\`.

**This does not call a model — you are the model.** You write the steps; this does the mechanical part you should not have to guess: one state per step, the NEXT transitions between them, \`final: true\` on the last one, and the envelope. Then it validates the result and refuses to hand back something the engine would mishandle.

**It does not write a file.** Use your own file tools to save \`fileContents\` wherever the operator wants it.

Args:
  - id (string): The flow id. Must be unique in the app that registers it.
  - name (string): Human name for the tour.
  - steps (array, 1+): Ordered steps:
      - id (string): unique within the flow
      - title (string): the popover heading
      - body (string, optional)
      - target (string | null, optional): a CSS selector, or null for a centred
        modal announcement, which is a supported shape rather than a workaround
      - placement ('top'|'bottom'|'left'|'right'|..., optional)
      - padding (number, optional)
      - clickThrough (boolean, optional)
  - sourceUrl (string, optional): where the steps were captured from.

Returns:
  {
    "valid": boolean,
    "issues": [ … ],           // as guideflow_validate_flow
    "flow": object,            // the FlowDefinition
    "fileContents": string,    // write this verbatim to <id>.flow.json
    "suggestedPath": string
  }

Examples:
  - Use when: "write me a three-step tour of the dashboard"
  - Use when: converting a recorded click-path into a flow
  - Don't use when: you already have a FlowDefinition (use guideflow_validate_flow)

Error Handling:
  - Duplicate step ids are rejected by name — goTo(), resume and the showIf skip
    loop all resolve the first match, so duplicates are silently wrong at runtime.`,
      inputSchema: {
        id: z.string().min(1).describe('The flow id'),
        name: z.string().min(1).describe('Human name for the tour'),
        steps: z
          .array(
            z.object({
              id: z.string().min(1),
              title: z.string().min(1),
              body: z.string().optional(),
              target: z.string().nullable().optional(),
              placement: z.string().optional(),
              padding: z.number().optional(),
              clickThrough: z.boolean().optional(),
            }),
          )
          .min(1)
          .describe('Ordered steps'),
        sourceUrl: z.string().optional().describe('Where the steps were captured from'),
      },
      annotations: READ_ONLY,
    },
    ({ id, name, steps, sourceUrl }) => {
      const draft = {
        kind: 'guideflow-draft',
        draftVersion: 1,
        id,
        name,
        steps,
        ...(sourceUrl !== undefined && { sourceUrl }),
      } as FlowDraft

      let flow
      try {
        flow = draftToFlow(draft)
      } catch (error) {
        return fail((error as Error).message)
      }

      const result = validateFlow(flow)
      return ok({
        valid: result.valid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        issues: issueLines(result.issues),
        flow,
        fileContents: stringifyFlowFile(flow, {
          generator: SERVER_NAME,
          ...(sourceUrl !== undefined && { sourceUrl }),
        }),
        suggestedPath: `${id}.flow.json`,
      })
    },
  )

  // ── extract strings ─────────────────────────────────────────────────────

  server.registerTool(
    'guideflow_extract_strings',
    {
      title: 'Extract a flow’s translatable strings',
      description: `Emit the ContentCatalogue skeleton for a flow: every translatable string, keyed by step id and state id, ready to be translated in place.

A catalogue sits **beside** the flow, never inside it — translators want a flat file of strings, not a state machine, and an untranslated key falls through to the flow's own copy so a partial translation degrades one string at a time.

**This does not translate anything — you are the model.** It tells you exactly which strings exist, which key each belongs to, and which \`{{token}}\` each one must keep. Translate the values in place, then check the result with guideflow_translate_flow.

Args:
  - path (string): Flow file, relative to the server root.
  - flowId (string): The flow's own \`id\`.
  - flow (object): A FlowDefinition, or a { gfFlowFile, flow } envelope, inline.
  Pass exactly one.

Returns:
  {
    "flowId": string,
    "path": string | null,        // null when the flow was passed inline
    "stringCount": number,        // translatable strings found
    "catalogue": {
      "steps":  { "<stepId>":  { "title"?, "body"?, "html"? } },
      "states": { "<stateId>": "<chapter label>" }
    },
    "tokens": { "steps.welcome.title": ["firstName"] },  // must survive translation
    "issues": [{ "code", "severity", "path", "message", "hint" }]
  }

Examples:
  - Use when: "translate the welcome tour into Spanish" -> extract, translate the values, then guideflow_translate_flow
  - Use when: you want to know whether a flow is translatable at all
  - Don't use when: you already have a filled catalogue (use guideflow_translate_flow)

Notes:
  - Values are the ORIGINAL copy, not blanks, so the file diffs source against
    translation. Overwrite each value; do not add keys.
  - \`steps\` and \`states\` are separate maps because step ids and state ids are
    separate namespaces — a state called "welcome" can coexist with a step
    called "welcome", and one flat map would silently collide.
  - Every \`{{token}}\` must appear in the translation. The catalogue is applied
    BEFORE interpolation, so a translated sentence containing {{firstName}}
    still resolves — wherever in the sentence you put it.
  - Steps in every state are extracted, not only those on the NEXT path.

Error Handling:
  - Refuses a flow that does not validate: a catalogue keyed on ids the engine
    would reject matches nothing at runtime, in silence.`,
      inputSchema: {
        path: z.string().min(1).optional().describe('Path relative to the server root'),
        flowId: z.string().min(1).optional().describe("The flow's own id"),
        flow: z.unknown().optional().describe('A FlowDefinition, inline'),
      },
      annotations: READ_ONLY,
    },
    ({ path, flowId, flow }) => {
      const source = resolveFlowSource(root, { path, flowId, flow })
      if (!source.ok) return fail(source.message)

      const extracted = extractStrings(source.flow)
      return ok({
        flowId: source.flow.id,
        path: source.path,
        stringCount: extracted.stringCount,
        stepCount: Object.keys(extracted.catalogue.steps).length,
        stateCount: Object.keys(extracted.catalogue.states).length,
        catalogue: extracted.catalogue,
        tokens: extracted.tokens,
        issues: issueLines(extracted.issues),
      })
    },
  )

  // ── check a translation ─────────────────────────────────────────────────

  server.registerTool(
    'guideflow_translate_flow',
    {
      title: 'Check a translated catalogue against its flow',
      description: `Validate a filled ContentCatalogue against the flow it is for, and return the bytes to save beside it.

**It does not call a translation service and does not translate — you are the model.** You translate; this catches the four ways a translated catalogue is silently wrong at runtime, none of which throws, logs, or fails a test in the host application:

  1. A key that resolves to no step or state. It is simply never read.
  2. A \`{{token}}\` present in the original and missing from the translation. The personalisation disappears in that locale only.
  3. A field the original step does not have. The catalogue merges over content, so it ADDS the line in this locale and no other.
  4. An empty value. \`{ ...content, ...override }\` treats it as a value, so it blanks the copy rather than falling through.

Args:
  - locale (string): The BCP 47 tag this catalogue is for, e.g. "es" or "pt-BR".
  - catalogue (object): { steps?: { <stepId>: { title?, body?, html? } }, states?: { <stateId>: label } }
  - path | flowId | flow: the flow to check against — exactly one, as guideflow_extract_strings.

Returns:
  {
    "locale": string,
    "valid": boolean,            // true when there are no ERRORS
    "errorCount": number,
    "warningCount": number,
    "issues": [{ "code", "severity", "path", "message", "hint" }],
    "coverage": {
      "total": number,           // translatable strings in the flow
      "translated": number,      // of those, how many the catalogue supplies
      "missingSteps": string[],
      "missingStates": string[]
    },
    "fileContents": string,      // present only when valid
    "suggestedPath": string      // e.g. "welcome.es.json"
  }

Codes you will see: token-lost, unknown-step, unknown-state, field-not-in-original, empty-override, unknown-field, token-invented, token-in-html, translation-unchanged, state-label-not-in-original, incomplete-translation.

Examples:
  - Use when: you have just translated the output of guideflow_extract_strings
  - Use when: reviewing a translation someone else committed
  - Don't use when: you want to check the flow itself (use guideflow_validate_flow)

Notes:
  - **It writes no file.** Save \`fileContents\` with your own file tools, then
    load it in the host and call \`gf.i18n.registerContent(locale, catalogue)\`.
    There is no loader for it: a catalogue is application data, and GuideFlow
    does not fetch.
  - An incomplete translation is a warning, never an error. A missing key falls
    through to the flow's own copy, which is a working page.
  - Token names are compared, not the written form: \`{{plan|your plan}}\` has a
    translatable fallback, so translating it is correct.`,
      inputSchema: {
        locale: z.string().min(1).describe('BCP 47 tag, e.g. "es" or "pt-BR"'),
        // Deliberately `unknown` rather than a modelled object, exactly as
        // guideflow_validate_flow takes its flow: the mistakes worth catching
        // here are shape mistakes, and a schema rejection would replace eleven
        // issues that each name a fix with one opaque parse error.
        catalogue: z.unknown().describe('The filled ContentCatalogue'),
        path: z.string().min(1).optional().describe('Path relative to the server root'),
        flowId: z.string().min(1).optional().describe("The flow's own id"),
        flow: z.unknown().optional().describe('A FlowDefinition, inline'),
      },
      annotations: READ_ONLY,
    },
    ({ locale, catalogue, path, flowId, flow }) => {
      const source = resolveFlowSource(root, { path, flowId, flow })
      if (!source.ok) return fail(source.message)

      const result = checkCatalogue(source.flow, catalogue)
      const issues: CatalogueIssue[] = result.issues
      return ok({
        locale,
        flowId: source.flow.id,
        path: source.path,
        valid: result.valid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
        issues: issueLines(issues),
        coverage: result.coverage,
        // Withheld when there are errors: handing back bytes to save would
        // invite committing a catalogue we have just said reaches nothing.
        ...(result.valid && {
          fileContents: `${JSON.stringify(catalogue, null, 2)}\n`,
          suggestedPath: `${source.flow.id}.${locale}.json`,
        }),
      })
    },
  )

  return server
}
