#!/usr/bin/env node

/**
 * Syncs repository metadata from repo.config.json into all package.json,
 * README.md, LICENSE, source-file headers and documentation files across
 * the monorepo.
 *
 * The script is idempotent: running it twice changes nothing the second time.
 *
 * Usage: node scripts/sync-repo-meta.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(ROOT, 'repo.config.json'), 'utf8'));

const { owner, repo, author, githubUrl, authorUrl } = config;
// Optional. When absent, `@email` header lines are removed rather than
// pointed at an address nobody reads.
const email = typeof config.email === 'string' && config.email ? config.email : null;

// Match any github.com/<owner>/<repo> URL that currently exists in the files.
// We detect the old owner/repo from the first package.json we find.
function detectCurrentOwnerRepo() {
  const corePkg = join(ROOT, 'packages/core/package.json');
  if (!existsSync(corePkg)) return null;
  const content = readFileSync(corePkg, 'utf8');
  const match = content.match(/https:\/\/github\.com\/([^/]+)\/([^/.#"]+)/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

const current = detectCurrentOwnerRepo();
if (!current) {
  console.error('Could not detect current owner/repo from packages/core/package.json');
  process.exit(1);
}

const oldGithubUrl = `https://github.com/${current.owner}/${current.repo}`;
const oldAuthorUrl = `https://github.com/${current.owner}`;

let filesChanged = 0;
let filesUnchanged = 0;

function rel(filePath) {
  return relative(ROOT, filePath).split('\\').join('/');
}

// Keeps the file's existing newline style. Without this the JSON re-serialise
// below rewrites every CRLF working copy to LF on every run, so the script
// never reports "already in sync" on Windows.
function matchLineEndings(original, content) {
  const lf = content.replace(/\r\n/g, '\n');
  return /\r\n/.test(original) ? lf.replace(/\n/g, '\r\n') : lf;
}

function writeIfChanged(filePath, original, updated) {
  const content = matchLineEndings(original, updated);
  // Compare newline-insensitively so a file whose newlines are merely mixed is
  // left alone: only a real text change is worth a write.
  const changed = content.replace(/\r\n/g, '\n') !== original.replace(/\r\n/g, '\n');
  if (changed) {
    writeFileSync(filePath, content, 'utf8');
    console.log(`  updated: ${rel(filePath)}`);
    filesChanged++;
  } else {
    filesUnchanged++;
  }
}

function replaceInFile(filePath, replacements) {
  if (!existsSync(filePath)) return;
  const original = readFileSync(filePath, 'utf8');
  let content = original;
  for (const [search, replace] of replacements) {
    content = content.replaceAll(search, replace);
  }
  writeIfChanged(filePath, original, content);
}

// Rewrites the identity block that heads every package entry point:
//
//   * @author  John Mugabe
//   * @email   someone@example.com      (dropped when repo.config.json has no email)
//   * @github  https://github.com/<owner>
//   * Copyright (c) 2026 John Mugabe. All rights reserved.
//
// Matching is by tag, not by old value, so a header that has drifted to an
// arbitrary name or URL is still brought back into line.
function normalizeSourceHeader(filePath) {
  const original = readFileSync(filePath, 'utf8');
  let content = original;

  // `\s` is deliberately avoided: it matches CR and LF, and JavaScript's
  // multiline `^` also anchors between the CR and LF of a CRLF pair, so a
  // `\s`-based pattern happily eats the previous line's newline.
  content = content.replace(/^([ \t]*\*[ \t]*@author[ \t]+)[^\r\n]*/gm, `$1${author}`);
  content = content.replace(/^([ \t]*\*[ \t]*@github[ \t]+)[^\r\n]*/gm, `$1${authorUrl}`);
  content = email
    ? content.replace(/^([ \t]*\*[ \t]*@email[ \t]+)[^\r\n]*/gm, `$1${email}`)
    : content.replace(/^[ \t]*\*[ \t]*@email[ \t]+[^\r\n]*(?:\r\n|\n|\r)?/gm, '');
  content = content.replace(
    /^([ \t]*\*[ \t]*Copyright \(c\) \d{4} )[^\r\n]*?(\. All rights reserved\.)[ \t]*/gm,
    `$1${author}$2`
  );

  writeIfChanged(filePath, original, content);
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', '__snapshots__']);

function* walkSources(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walkSources(full);
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

function updatePackageJson(filePath) {
  if (!existsSync(filePath)) return;
  const original = readFileSync(filePath, 'utf8');
  const pkg = JSON.parse(original);

  pkg.author = `${author} (${authorUrl})`;
  if (pkg.repository && typeof pkg.repository === 'object') {
    pkg.repository.url = `${githubUrl}.git`;
  }
  pkg.homepage = `${githubUrl}#readme`;
  pkg.bugs = `${githubUrl}/issues`;

  const updated = JSON.stringify(pkg, null, 2) + '\n';
  writeIfChanged(filePath, original, updated);
}

// --- Run ---

console.log(`\nSyncing repo metadata:`);
console.log(`  owner:  ${current.owner} → ${owner}`);
console.log(`  repo:   ${current.repo} → ${repo}`);
console.log(`  url:    ${oldGithubUrl} → ${githubUrl}`);
console.log();

// 1. Package JSON files
console.log('Package manifests:');
const packages = readdirSync(join(ROOT, 'packages'));
for (const pkg of packages) {
  const pkgJson = join(ROOT, 'packages', pkg, 'package.json');
  updatePackageJson(pkgJson);
}

// 2. Package README files
console.log('\nPackage READMEs:');
for (const pkg of packages) {
  const readme = join(ROOT, 'packages', pkg, 'README.md');
  replaceInFile(readme, [
    [oldGithubUrl, githubUrl],
    [oldAuthorUrl, authorUrl],
  ]);
}

// 3. Source-file headers (packages/*/src is shipped in the npm tarball via
//    the `files` field, so these headers reach consumers).
console.log('\nSource headers:');
for (const pkg of packages) {
  for (const file of walkSources(join(ROOT, 'packages', pkg, 'src'))) {
    normalizeSourceHeader(file);
  }
}

// 4. LICENSE and root-level docs
console.log('\nRoot files:');
const license = join(ROOT, 'LICENSE');
if (existsSync(license)) {
  const original = readFileSync(license, 'utf8');
  const content = original.replace(
    /^(Copyright \(c\) \d{4} )[^\r\n]*/m,
    `$1${author} (${authorUrl})`
  );
  writeIfChanged(license, original, content);
}
for (const name of ['README.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
  replaceInFile(join(ROOT, name), [
    [oldGithubUrl, githubUrl],
    [oldAuthorUrl, authorUrl],
  ]);
}

// 5. VitePress config
console.log('\nVitePress config:');
const vitepressConfig = join(ROOT, 'apps/docs/.vitepress/config.ts');
replaceInFile(vitepressConfig, [
  [oldGithubUrl, githubUrl],
  [`base: '/${current.repo}/'`, `base: '/${repo}/'`],
]);

// 6. Docs markdown files
console.log('\nDocs pages:');
const docsIndex = join(ROOT, 'apps/docs/index.md');
replaceInFile(docsIndex, [[oldGithubUrl, githubUrl]]);

const docsPackagesDir = join(ROOT, 'apps/docs/packages');
if (existsSync(docsPackagesDir)) {
  for (const file of readdirSync(docsPackagesDir)) {
    if (file.endsWith('.md')) {
      replaceInFile(join(docsPackagesDir, file), [[oldGithubUrl, githubUrl]]);
    }
  }
}

// Summary
console.log(`\nDone: ${filesChanged} file(s) updated, ${filesUnchanged} already in sync.\n`);
