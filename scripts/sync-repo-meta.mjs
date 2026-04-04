#!/usr/bin/env node

/**
 * Syncs repository metadata from repo.config.json into all package.json,
 * README.md, and documentation files across the monorepo.
 *
 * Usage: node scripts/sync-repo-meta.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(ROOT, 'repo.config.json'), 'utf8'));

const { owner, repo, author, githubUrl, authorUrl } = config;

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

function replaceInFile(filePath, replacements) {
  if (!existsSync(filePath)) return;
  const original = readFileSync(filePath, 'utf8');
  let content = original;
  for (const [search, replace] of replacements) {
    content = content.replaceAll(search, replace);
  }
  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    console.log(`  updated: ${filePath.replace(ROOT + '/', '')}`);
    filesChanged++;
  } else {
    filesUnchanged++;
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
  if (updated !== original) {
    writeFileSync(filePath, updated, 'utf8');
    console.log(`  updated: ${filePath.replace(ROOT + '/', '')}`);
    filesChanged++;
  } else {
    filesUnchanged++;
  }
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

// 3. VitePress config
console.log('\nVitePress config:');
const vitepressConfig = join(ROOT, 'apps/docs/.vitepress/config.ts');
replaceInFile(vitepressConfig, [
  [oldGithubUrl, githubUrl],
  [`base: '/${current.repo}/'`, `base: '/${repo}/'`],
]);

// 4. Docs markdown files
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
