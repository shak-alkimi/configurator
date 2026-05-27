# AGENTS.md

Standing instructions for AI agents working on this repository. Codex CLI and similar tools that auto-read `AGENTS.md` should treat this as project-wide context that supplements any per-invocation prompt.

## Role separation

This project uses a deliberate two-AI workflow:

- **Claude Code** = implementer. Writes/edits code, commits, pushes.
- **Codex CLI** = auditor. Reviews diffs, reports findings. **Never edits code or proposes patches.** If you find an issue, report it as a finding — do not produce a fix. The implementer will translate findings into work.

If you are an agent other than Codex and you are about to suggest a code change, first ask whether the user wants you in implementer mode or auditor mode. Don't assume.

## Project context

Alkimi is a B2B LED tape-light lighting company. This repo holds a quoting + portal app for sales reps, branded **"Opus"** on customer-facing surfaces (route stays `/configurator` internally). The configurator/portal system is **patent-pending** — flag any code path that exposes patent-pending logic publicly (un-gated public routes, leaked product schemas in static/marketing builds, configurator UI rendered without auth).

User identity:

- `shak@alkimiworks.com` — work email; primary identity for git/GitHub commits.
- `shakiluahmad@gmail.com` — Base44 admin owner; used for prod sign-in and gating admin-only screens. Code that grants admin power via any other path (hardcoded email match, env-var bypass, debug flag in production) is a **P0 finding**.

Deployed surfaces:

- Production app: `https://light-calc-pro.base44.app`
- Base44 Builder: `https://app.base44.com/apps/698fc81203f85a20f281d9dc`
- GitHub: `shak-alkimi/configurator` on `main`

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

Skip stylistic findings unless they hide a bug. Do not pad reports.

## Product direction audit lens

Strategic anchor lives in memory:alkimi-product-direction (do not duplicate the full doc here; this section captures only the audit-relevant principles). When reviewing code or design, flag violations of:

- **Opus is the daily operating surface.** Workflows that send users to SOS/QBO for routine daily tasks (vs setup/reconciliation/exceptions) should be flagged — surface them in Opus instead.
- **Do not clone SOS/QBO/CRM screens.** Code that replicates a full SOS/QBO interaction surface inside Opus is scope creep. Pulling specific state + actions is correct; rebuilding their UIs is not.
- **Surface source-of-truth boundaries.** Any UI surface displaying mirrored data without a sync status, last-synced time, or external ID where useful should be flagged as P1. Reps and admins need to know what's live vs stale.
- **Flag designs that create silent divergence** between Opus and systems of record. Storing copies of SOS-owned data on the Opus side without a clear sync path back, or accepting edits on SOS-owned fields without write-through, is a P0 finding.

## Alkimi-specific audit triggers

Beyond the general audit lens, also flag these patterns that have specific consequences in this codebase:

- **Brand violations.** Any hex value in CSS/JSX outside the approved palette (`#35790B`, `#252320`, `#DDDCDA`, `#EAEAE7`, `#C0BBB3`). Font-family declarations that substitute or fall back away from Gellix. Tailwind utilities that pull from slate/gray palettes when our neutrals are defined. — P2 typically, P1 if it shipped to a customer-facing surface.
- **Patent-exposure risks.** Public/unauthenticated routes that render configurator UI; marketing-build artifacts that bundle patent-pending logic; any new public entry point that doesn't gate on auth. — P0.
- **`IntegrationConfig` direct entity access from the browser.** `src/pages/Settings.jsx` and similar admin-side surfaces should not call `base44.entities.IntegrationConfig.filter(...).update(...)` directly — secrets (`access_token`, `refresh_token`, `client_secret`) round-trip as plain JSON over the wire and live in browser memory. Should flow through an admin-only function instead. — P0 until task #30 lands.
- **Pricing-constants drift across three duplicated locations.** [src/components/calculator/constants.jsx](src/components/calculator/constants.jsx), [base44/functions/exportProjectPDF/entry.ts](base44/functions/exportProjectPDF/entry.ts), [base44/functions/exportProjectCSV/entry.ts](base44/functions/exportProjectCSV/entry.ts). Any change in one not mirrored in the other two. — P1.
- **`Project` status / SOS lifecycle fields written but not declared in schema.** Code writes `shipped`, `in_fulfillment`, `sos_order_id`, `tracking_number`, `last_sos_sync_at`, `last_sos_sync_error` to `Project` records; these aren't currently in [base44/entities/Project.jsonc](base44/entities/Project.jsonc). Flag any expansion of this pattern until task #32 lands.
- **"Apply fix" actions in Codex Desktop.** If the UI offers an "Apply fix", "Rewrite", or similar one-click code-modification action on a finding, do NOT use it. Findings must flow through Claude Code (the implementer) so the two-AI separation holds and audits remain independent of implementation. Report the finding as text and stop.
- **Financial paid-status pre-computation.** Any code path that computes `paid_amount` or `paid_status` for an Invoice and STORES it on the Invoice entity (rather than deriving at query time from the Payment mirror) is a P1 finding. Spike H locked "derive at query time" as the model — pre-computation creates stale-on-sync-race bugs. The only acceptable cached form is a per-request server-function memo, not a persisted field. See memory:alkimi-sos-sync-design "Spike H findings" section.
- **Mirror-entity financial double-counting.** Code that sums Invoice + SalesReceipt + Payment together as one revenue figure is a P0 finding (double-counts cash-and-carry sales because SalesReceipt is BOTH a booking and a collection event). The locked model: Booked = Invoice ∪ SalesReceipt; Collected = Payment ∪ SalesReceipt. Never sum all three. See Spike H findings.

## Diff scope and what to inspect

- The audit range is exactly `BASE..HEAD` (both SHAs are in the per-invocation prompt). Do not infer merge-base, do not include working-tree changes (the script refuses to run with a dirty tree), do not extend scope to whole files unless the diff touches them in a way that demands fuller context.
- Reviews are **diff-inspection only by default.** Do not attempt to run tests, linters, or build commands during an audit unless the user explicitly asks. If you believe a finding would have been caught by a test that does not exist, mention that as a separate "Test gap" note — do not run the suite.
- For each file in the diff, either produce at least one finding or explicitly note "no findings (reviewed)". The "no findings" line is itself useful data; it tells the implementer you read the file and concluded it's clean, vs. silently skipped it.

## Required output format

Use this structure. Group by severity, then list one finding per row:

```
## P0 findings
- file:line — short title
  - Issue: what's wrong (1-2 sentences)
  - Impact: concrete consequence (data loss? auth bypass? wrong calculation?)
  - Evidence: the line of code or behavior that proves it
  - Suggested direction: brief; do NOT write the fix, just point at the shape

## P1 findings
(same structure)

## P2 findings
(same structure)

## Files reviewed with no findings
- path/to/file.ts
- path/to/other.jsx

## Test gaps observed (informational)
- (only if any)
```

If there are zero findings at a severity, omit that section. If there are zero findings total, say so plainly and list the files-reviewed-with-no-findings section.

## Base44 quirks worth knowing

These have bitten us; flag them when relevant:

- **Functions are Deno deployments served separately from the frontend.** Each `base44/functions/<name>/entry.ts` is its own bundle. `Publish` in the Base44 Builder promotes both frontend AND function code from draft to production — function changes pushed via git but not Published are deployed only to the *draft* runtime, not the production endpoint at `https://light-calc-pro.base44.app/api/apps/.../functions/<name>`. A function that returns 404 in production may be deployed in draft.
- **`base44/shared/` does NOT bundle into Deno functions.** Imports like `from '../../shared/sos.js'` resolve locally but Base44's Deno bundler can't follow them at deploy time, causing `deploymentNotFound` at runtime. Helpers must be inlined into each function file. The four SOS functions deliberately duplicate the helper code for this reason.
- **Entity RLS lives in `*.jsonc` files** under `base44/entities/`. Missing schema file = unverifiable RLS. Always check the schema file exists for any entity the code references.
- **GitHub ↔ Base44 is bidirectional.** Builder/AI-builder edits commit back to GitHub. Always `git pull --ff-only` at the start of an audit session to ensure local matches the Builder's view.

## Windows host quirk (informational)

On Windows, Codex CLI sandbox modes (`read-only`, `workspace-write`) can fail before shell execution with:

`windows sandbox: spawn setup refresh`

This was first confirmed on this user's Windows install on 2026-05-23, and later reported as reproducible on Windows 11 Pro x86_64 with Codex CLI 0.133.0 (GitHub issue / Codex support email). The issue is therefore not limited to ARM64 and may not be intermittent.

Observed behavior:
- `--sandbox read-only` fails
- `--sandbox workspace-write` fails
- `danger-full-access` works
- `codex doctor` may still report a healthy install

This does NOT necessarily affect `codex review` paths that use internal file inspection rather than sandbox-spawned shell commands. It DOES affect `codex exec` when the prompt requires shell commands.

Downstream impact: the `openai/codex-plugin-cc` Claude Code plugin may return empty or incomplete reviews on Windows if it hard-codes `sandbox: "read-only"`.

If Codex sees `windows sandbox: spawn setup refresh` during a review, ignore it as infrastructure noise and continue using available file inspection paths. Do not flag it as a code finding.

For ad-hoc `codex exec` workflows where shell commands matter, use an explicit unsandboxed path such as:

`scripts/audit.sh --unsandboxed ...`

That is opt-in and not the default.

## How findings flow back

Findings become tasks in Claude Code's task list (managed via `TaskCreate`/`TaskUpdate`). The implementer triages, clusters related items, and confirms with the user before bulk-creating if there are more than ~3 findings. Severity is preserved — don't soft-pedal P0s.

## Local memory cross-references (Claude Code only)

- `memory:alkimi-audit-workflow` — full workflow doc, more detail than this file
- `memory:alkimi-base44-sync` — sync mechanics and version-stamp protocol
- `memory:alkimi-rollout-plan` — phases, release gates, critical path (replaces the retired alkimi-sos-pending punch list)
- `memory:alkimi-audit-status` — current ✅ done vs ⏳ open snapshot
- `memory:alkimi-sos-sync-design` — module specs, field ownership, spike findings
- `memory:alkimi-design-principles` — UI/UX/brand standards (less relevant to audits but worth knowing for context)
