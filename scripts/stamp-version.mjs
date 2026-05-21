#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const sha = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim();
const ts = new Date().toISOString();
const payload = { sha, ts };

const out = resolve(root, 'base44/shared/version.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');

console.log(`Stamped version ${sha} @ ${ts} → ${out}`);
