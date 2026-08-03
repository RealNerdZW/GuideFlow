// ---------------------------------------------------------------------------
// Finding and reading flow files.
//
// A `.flow.json` is a static asset (ADR-014) — there is no backend to ask, so
// "list the flows" means "walk a directory". That is the honest implementation
// of `list_flows`, and it is genuinely what an agent pointed at a repository
// needs.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import type { FlowDefinition } from '@guideflow/core'
import { parseFlowFile, type FlowIssue } from '@guideflow/core/authoring'
import { flowFingerprint } from '@guideflow/core/versioning'

import { resolveInRoot } from './root.js'

/** Directories that are never worth walking and are always huge. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next'])

/** Bounded so a mistyped root cannot walk a whole disk. */
const MAX_DEPTH = 8
const MAX_FILES = 500

export interface FlowSummary {
  /** The flow's own id, or null when the file could not be parsed. */
  id: string | null
  /** Relative to the server root, with forward slashes on every platform. */
  path: string
  valid: boolean
  errorCount: number
  warningCount: number
  /** Total steps on the NEXT-only path from `initial`, or null when invalid. */
  stepCount: number | null
  /** The structural fingerprint, so an agent can see what a republish changes. */
  fingerprint: string | null
}

/**
 * The `id` a file claims, read straight from the JSON.
 *
 * Only used when validation withheld the flow. It is untrusted — a string or
 * nothing, never an object — because it is displayed back to a model.
 */
function rawFlowId(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object') return null
    const record = parsed as Record<string, unknown>
    const inner = record['flow']
    const candidate =
      inner !== null && typeof inner === 'object'
        ? (inner as Record<string, unknown>)['id']
        : record['id']
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
  } catch {
    return null
  }
}

/** Forward slashes everywhere, so a tool result reads the same on any OS. */
function posix(p: string): string {
  return p.split(sep).join('/')
}

/**
 * Every `*.flow.json` under `root`, depth- and count-bounded.
 *
 * Sorted by path so the listing is stable between calls — an agent comparing
 * two results should not see phantom churn from readdir ordering.
 */
export function findFlowFiles(root: string): string[] {
  const out: string[] = []

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || out.length >= MAX_FILES) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return // unreadable directory: skip it rather than fail the whole listing
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return
      if (SKIP.has(entry) || entry.startsWith('.')) continue
      const full = join(dir, entry)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue // a broken symlink, or a file that vanished mid-walk
      }
      if (isDir) walk(full, depth + 1)
      else if (entry.endsWith('.flow.json')) out.push(full)
    }
  }

  walk(root, 0)
  return out.sort()
}

/**
 * Count steps the way the engine does: walk `NEXT` from `initial`.
 *
 * Not `Object.values(states).flatMap(s => s.steps)`. Counters are flow-wide and
 * follow the NEXT-only path, so a state reachable only by a custom transition
 * is not on it — that distinction is exactly what put a Done button on step one
 * of a two-state tour before ADR-008.
 */
function countSteps(flow: FlowDefinition): number {
  let total = 0
  let cursor: string | undefined = flow.initial
  const seen = new Set<string>()
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor)
    const node = flow.states[cursor]
    if (!node) break
    total += node.steps?.length ?? 0
    if (node.final) break
    const next: unknown = node.on?.['NEXT']
    cursor = typeof next === 'string' ? next : (next as { target?: string } | undefined)?.target
  }
  return total
}

export interface ReadFlowResult {
  path: string
  flow: FlowDefinition | null
  valid: boolean
  issues: FlowIssue[]
  fingerprint: string | null
  stepCount: number | null
}

/** Read and parse one flow file. Never throws for a bad flow — only for I/O. */
export function readFlowFile(root: string, requested: string): ReadFlowResult {
  const abs = resolveInRoot(root, requested)
  const text = readFileSync(abs, 'utf-8')
  const parsed = parseFlowFile(text)
  return {
    path: posix(relative(root, abs)),
    flow: parsed.flow,
    valid: parsed.valid,
    issues: parsed.issues,
    fingerprint: parsed.flow ? flowFingerprint(parsed.flow) : null,
    stepCount: parsed.flow ? countSteps(parsed.flow) : null,
  }
}

/** Summarise every flow file under the root. */
export function listFlows(root: string): FlowSummary[] {
  return findFlowFiles(root).map((abs) => {
    let text: string
    try {
      text = readFileSync(abs, 'utf-8')
    } catch (error) {
      return {
        id: null,
        path: posix(relative(root, abs)),
        valid: false,
        errorCount: 1,
        warningCount: 0,
        stepCount: null,
        fingerprint: null,
        _read: (error as Error).message,
      } as FlowSummary
    }
    const parsed = parseFlowFile(text)
    return {
      // `validateFlow` returns no flow when it is invalid — deliberately, since
      // a partially repaired flow is worse than none. But a listing whose id is
      // null for every broken file is useless for the exact case you most want
      // it: "which file is the welcome tour, the one that is failing?" So the
      // id is recovered from the raw JSON when validation withheld it.
      id: parsed.flow?.id ?? rawFlowId(text),
      path: posix(relative(root, abs)),
      valid: parsed.valid,
      errorCount: parsed.errors.length,
      warningCount: parsed.warnings.length,
      stepCount: parsed.flow ? countSteps(parsed.flow) : null,
      fingerprint: parsed.flow ? flowFingerprint(parsed.flow) : null,
    }
  })
}

/**
 * Find a flow by its own `id` rather than by path.
 *
 * Returns every match, because two files CAN declare the same id and an agent
 * that silently got the first one would author against the wrong file.
 */
export function findByFlowId(root: string, flowId: string): FlowSummary[] {
  return listFlows(root).filter((f) => f.id === flowId)
}
