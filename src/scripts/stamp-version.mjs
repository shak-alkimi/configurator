import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let sha = 'unknown';
let ts = new Date().toISOString();

try {
  sha = execSync('git rev-parse --short HEAD', { stdio: ['pipe', 'pipe', 'pipe'] })
    .toString()
    .trim();
} catch {
  // Not a git repo (e.g. base44 build environment) — use fallback
  sha = 'unknown';
}

const outDir = join(__dirname, '../shared');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'version.json'),
  JSON.stringify({ sha, ts }, null, 2) + '\n',
);

console.log(`Version stamped: sha=${sha} ts=${ts}`);