#!/usr/bin/env node
// Writes the current short SHA into BOTH the frontend marker and the backend
// getVersion function. When both files are committed together the portal
// footer's frontend/backend comparison will match — proving the same commit
// reached both layers of the deploy.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();

const targets = [
  {
    path: resolve(root, 'src/lib/deploy-marker.js'),
    pattern: /export const DEPLOY_MARKER = '[^']*';/,
    replacement: `export const DEPLOY_MARKER = '${sha}';`,
  },
  {
    path: resolve(root, 'base44/functions/getVersion/entry.ts'),
    pattern: /const VERSION_SHA = '[^']*';/,
    replacement: `const VERSION_SHA = '${sha}';`,
  },
];

for (const { path, pattern, replacement } of targets) {
  const src = readFileSync(path, 'utf8');
  const updated = src.replace(pattern, replacement);
  if (updated === src) {
    console.error(`Could not find stamp pattern in ${path}`);
    process.exit(1);
  }
  writeFileSync(path, updated);
}

console.log(`Stamped ${sha} → src/lib/deploy-marker.js + base44/functions/getVersion/entry.ts`);
