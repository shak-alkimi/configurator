#!/usr/bin/env node
// Updates the hardcoded SHA in the getVersion Deno function so the portal's
// "check backend" footer can prove the deployed function matches the deployed
// frontend. Run before pushing: `npm run stamp` (or via `prebuild`).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entryPath = resolve(root, 'base44/functions/getVersion/entry.ts');

const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();

const src = readFileSync(entryPath, 'utf8');
const updated = src.replace(
  /const VERSION_SHA = '[^']*';/,
  `const VERSION_SHA = '${sha}';`
);

if (updated === src) {
  console.error('Could not find VERSION_SHA constant in', entryPath);
  process.exit(1);
}

writeFileSync(entryPath, updated);
console.log(`Stamped ${sha} → ${entryPath}`);
