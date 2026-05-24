# AGENTS.md

Standing instructions for AI agents working on this repository. Codex CLI and similar tools that auto-read `AGENTS.md` should treat this as project-wide context that supplements any per-invocation prompt.

## Role separation

This project uses a deliberate two-AI workflow:

- **Claude Code** = implementer. Writes/edits code, commits, pushes.
- **Codex CLI** = auditor. Reviews diffs, reports findings. **Never edits code or proposes patches.** If you find an issue, report it as a finding — do not produce a fix. The implementer will translate findings into work.

If you are an agent other than Codex and you are about to suggest a code change, first ask whether the user wants you in implementer mode or auditor mode. Don't assume.

## Branch / checkout discipline

- **Audits run from `main` only.** The `scripts/audit.sh` wrapper enforces this; if you are invoked outside the wrapper, verify with `git rev-parse --abbrev-ref HEAD` before reviewing. Auditing a feature branch while work has landed on `main` produces stale findings and wastes both agents' cycles. This has happened before (2026-05-23, `codex-sync-baseline` mismatch); the guard exists because of that incident.
- **Per-invocation prompts include exact branch + base SHA + HEAD SHA.** Before reviewing, confirm your local checkout contains those commits. If it does not, **STOP and report the mismatch** in your output — do NOT silently audit a different snapshot in its place.
- **Working tree must be clean for an audit run.** If `git status --porcelain` returns anything, the audit doesn't correspond to a SHA the user can reference later. Refuse to audit dirty trees.

## Audit lens

When reviewing, apply this lens in order of severity. P0/P1/P2 classification expected on every finding, with file:line citations:

- **Auth gaps.** Does every function call `base44.auth.me()` and gate by role/ownership before any `asServiceRole` read or write? Functions reachable via HTTP endpoint with no auth check are P0.
- **Client-trusted inputs.** Any value from request body that affects security or environment routing (`data_env`, `project_id`, role flags, IDs that should be derived from the auth principal) — flag as P0.
- **Data-loss risk.** Delete endpoints without auth + trigger-source verification. Service-role writes with no ownership check. Mass-mutation endpoints with no idempotency.
- **Schema / field mismatches.** Compare `base44/entities/*.jsonc` against the fields the code actually reads/writes. Undeclared fields work today by Base44's silent-accept behavior, but they don't surface in the Builder data inspector and are fragile.
- **Drift between source-of-truth and copies.** `base44/shared/` files do NOT bundle into Deno function deploys (see "Base44 quirks" below) — so SOS function helpers are intentionally inlined and duplicated across the four SOS functions. Drift between copies is a real risk, flag it. Separately, pricing constants in `base44/shared/pricing.js` are imported by frontend but functions need their own copy.
- **OAuth refresh correctness.** Token refresh on 401 should happen exactly once per call, persist the new token + refresh_token (if rotated) back to storage, then retry. Multiple retries or stale-token reuse → flag.
- **Idempotency on writes.** Any write that creates an external resource (SOS sales order, invoice, etc.) needs an "already exists" check based on a persisted reference field (`sos_order_id` etc.).
- **Secret handling.** Tokens / client_secret returned to the browser? Plaintext in entity storage with permissive RLS? `console.log` of secrets? P0. Error messages that include token excerpts or OAuth client metadata in non-admin contexts → P1.
- **Error paths that swallow data.** `catch {}`. `.catch(() => {})`. Failure modes where the user gets "OK" but the work didn't happen.
- **Missing input validation.** Required fields not checked. Numeric fields not bounded. Enum fields not validated against allowed values.

Skip stylistic findings unless they hide a bug. Do not pad reports — if a file in scope has no issues, say so explicitly.

## Base44 quirks worth knowing

These have bitten us; flag them when relevant:

- **Functions are Deno deployments served separately from the frontend.** Each `base44/functions/<name>/entry.ts` is its own bundle. `Publish` in the Base44 Builder promotes both frontend AND function code from draft to production — function changes pushed via git but not Published are deployed only to the *draft* runtime, not the production endpoint at `https://light-calc-pro.base44.app/api/apps/.../functions/<name>`. A function that returns 404 in production may be deployed in draft.
- **`base44/shared/` does NOT bundle into Deno functions.** Imports like `from '../../shared/sos.js'` resolve locally but Base44's Deno bundler can't follow them at deploy time, causing `deploymentNotFound` at runtime. Helpers must be inlined into each function file. The four SOS functions deliberately duplicate the helper code for this reason.
- **Entity RLS lives in `*.jsonc` files** under `base44/entities/`. Missing schema file = unverifiable RLS. Always check the schema file exists for any entity the code references.
- **GitHub ↔ Base44 is bidirectional.** Builder/AI-builder edits commit back to GitHub. Always `git pull --ff-only` at the start of an audit session to ensure local matches the Builder's view.

## How findings flow back

Findings become tasks in Claude Code's task list (managed via `TaskCreate`/`TaskUpdate`). The implementer triages, clusters related items, and confirms with the user before bulk-creating if there are more than ~3 findings. Severity is preserved — don't soft-pedal P0s.

## Local memory cross-references (Claude Code only)

- `memory:alkimi-audit-workflow` — full workflow doc, more detail than this file
- `memory:alkimi-base44-sync` — sync mechanics and version-stamp protocol
- `memory:alkimi-sos-pending` — open SOS integration work + design questions
- `memory:alkimi-design-principles` — UI/UX/brand standards (less relevant to audits but worth knowing for context)
