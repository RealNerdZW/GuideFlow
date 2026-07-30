#!/usr/bin/env node
/**
 * fsx — tiny cross-platform filesystem helper for package scripts.
 *
 * Package scripts previously used POSIX `rm -rf` and `cp -r`, which fail in
 * PowerShell and cmd.exe (where `rm`/`cp` are aliases for cmdlets that reject
 * those flags). This replaces them without adding a dependency, which matters
 * because @guideflow/core's zero-dependency budget is a headline promise.
 *
 * Usage:
 *   node ../../scripts/fsx.mjs rm <path...>        # recursive, never fails on missing
 *   node ../../scripts/fsx.mjs cp <src> <dest>     # recursive copy
 *
 * Paths are resolved relative to the current working directory, i.e. the
 * package that runs the script.
 */

import { cpSync, existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const [, , command, ...args] = process.argv

function fail(message) {
  console.error(`[fsx] ${message}`)
  process.exit(1)
}

switch (command) {
  case 'rm': {
    if (args.length === 0) fail('rm needs at least one path')
    for (const target of args) {
      rmSync(resolve(process.cwd(), target), { recursive: true, force: true })
    }
    break
  }

  case 'cp': {
    const [src, dest] = args
    if (!src || !dest) fail('cp needs <src> <dest>')
    const from = resolve(process.cwd(), src)
    const to = resolve(process.cwd(), dest)
    if (!existsSync(from)) fail(`cp source does not exist: ${from}`)
    cpSync(from, to, { recursive: true })
    break
  }

  default:
    fail(`unknown command "${command ?? ''}" — expected "rm" or "cp"`)
}
