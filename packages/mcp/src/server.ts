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
// ---------------------------------------------------------------------------

import {
  draftToFlow,
  explainNotLinear,
  stringifyFlowFile,
  validateFlow,
  type FlowDraft,
  type FlowIssue,
} from '@guideflow/core/authoring'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

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

/** Issues, trimmed to what a model needs to act. */
function issueLines(issues: FlowIssue[]): Array<Record<string, unknown>> {
  return issues.map((i) => ({
    code: i.code,
    severity: i.severity,
    path: i.path,
    message: i.message,
    hint: i.hint,
  }))
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
          const matches = findByFlowId(root, flowId)
          if (matches.length === 0) {
            return fail(
              `No flow with id "${flowId}" under ${root}. Run guideflow_list_flows to see what exists.`,
            )
          }
          if (matches.length > 1) {
            return fail(
              `Ambiguous: ${matches.length} files declare the id "${flowId}" — ` +
                `${matches.map((m) => m.path).join(', ')}. Pass one of them as \`path\`.`,
            )
          }
          target = matches[0]?.path
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

  return server
}
