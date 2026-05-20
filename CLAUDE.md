# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Internal quoting tool for **Alkimi** (LED tape-light business). Built on **Base44** — a hosted low-code platform. This repo is bidirectionally synced with the Base44 Builder at app ID `698fc81203f85a20f281d9dc` ("ALKIMI"): pushes here reflect in the Builder; edits in the Builder land here. Publish via the Base44 web UI, not via this repo.

## Commands

```bash
npm run dev         # vite dev server
npm run build       # production build → ./dist
npm run preview     # serve the production build
npm run lint        # eslint, quiet mode (only src/components, src/pages, src/Layout.jsx)
npm run lint:fix
npm run typecheck   # tsc against jsconfig.json (checkJs on src/components + src/pages)
```

No test runner is configured.

`.env.local` must define `VITE_BASE44_APP_ID` and `VITE_BASE44_APP_BASE_URL` (see README).

## Architecture

The codebase has **two halves that must stay in sync**:

### 1. Frontend — `src/` (Vite + React 18 + Tailwind + shadcn/ui + React Query)

- **Single page app.** Routing is driven by [src/pages.config.js](src/pages.config.js), which is **auto-generated** — never add imports or edit `PAGES` by hand. The only editable field is `mainPage`. Currently only `Calculator` exists.
- **SDK client.** [src/api/base44Client.js](src/api/base44Client.js) creates a singleton `base44` from `@base44/sdk` using params resolved in [src/lib/app-params.js](src/lib/app-params.js) (URL params override env, then localStorage). All entity CRUD and server-function invocations go through this client.
- **Auth.** [src/lib/AuthContext.jsx](src/lib/AuthContext.jsx) wraps the app; it fetches public app settings, calls `base44.auth.me()`, and gates rendering on `auth_required` / `user_not_registered` states. The main `App` shows a spinner until auth resolves.
- **Server state via React Query.** See [src/pages/Calculator.jsx](src/pages/Calculator.jsx) for the canonical pattern — `useQuery` for `Project` and `TapeRun` lists, mutations with `onSuccess` invalidations, and optimistic `setQueryData` for the drag-to-reorder flow.
- **Path alias** `@/*` → `./src/*` (see [jsconfig.json](jsconfig.json)). shadcn is configured in [components.json](components.json) (New York style, neutral base, Lucide icons, JSX not TSX).
- **ESLint scope is narrow** ([eslint.config.js](eslint.config.js)): only `src/components/**`, `src/pages/**`, `Layout.jsx`. `src/lib/`, `src/components/ui/`, and `src/api/` are intentionally ignored. Don't widen this without reason — shadcn-generated UI components are not meant to be linted.

### 2. Backend — `base44/` (entity schemas + Deno serverless functions)

- **Entities** are JSONC schemas in `base44/entities/`:
  - `Project` — quote/customer info, `status` (draft/submitted/approved), `drivers[]` (denormalized driver config). Has **row-level security**: users only see/edit their own projects unless they have `role: admin`.
  - `TapeRun` — child of Project (linked via `project_id`), holds length, tape type, CCT, channel type, driver_group, and display `order`.
- **Server functions** live in `base44/functions/<name>/entry.ts` and run on **Deno** (note `npm:@base44/sdk@…` style imports). Invoke from the frontend via `base44.functions.invoke('name', payload)`.
  - `exportProjectPDF` — generates a quote PDF with `jspdf`. Uses `asServiceRole` to bypass RLS.
  - `exportProjectCSV` — same shape, returns CSV. Has a local `escapeCSV` helper.
  - `cascadeDeleteTapeRuns` — **event-driven** (reads `event.entity_id` from the request body). Wired in the Base44 Builder to fire on `Project` delete; cleans up child `TapeRun`s. Not invoked directly from the client.

### Critical invariant: pricing constants are duplicated

The tape/channel/driver pricing and clip math is defined in **three places** and must be kept in sync manually:
- [src/components/calculator/constants.jsx](src/components/calculator/constants.jsx) — used by the in-app `MaterialsCalculator`
- [base44/functions/exportProjectPDF/entry.ts](base44/functions/exportProjectPDF/entry.ts) (inline `CONSTANTS` block)
- [base44/functions/exportProjectCSV/entry.ts](base44/functions/exportProjectCSV/entry.ts) (inline `CONSTANTS` block)

Both server files carry a `// keep in sync with src/components/calculator/constants.jsx` comment. If you change a price, watts/ft, driver capacity, clip rule, or shipping rate, change it in all three. The Deno functions can't import from `src/`.

### Server-function quirks

- `entity.filter(...)` on the server takes a long positional signature: `filter(query, _, _, _, data_env)` — `data_env` (passed in from the request body) routes between prod / staging data. Preserve that shape when editing.
- Server entities return records as `{ id, data: {…fields} }`; the existing functions use `runData = run.data || run` to handle both shapes defensively.

## Zapier integration (Base44 ↔ GitHub)

Zapier is connected and available to Claude Code via the Zapier MCP tools (`mcp__cfe8bae3-*`). The following actions are enabled:

**Base44** (use `execute_zapier_read_action` / `execute_zapier_write_action`):
- `query_entity_records` — read live `Project` or `TapeRun` records from the production app
- `create_entity` — create a new `Project` or `TapeRun` record

**GitHub** (repo: `shak-alkimi/configurator`):
- Read: find branches, issues, PRs, repos, users, org membership
- Write: create/update issues, PRs, branches, comments, labels, reviews, files

Use these tools when you need to inspect live app data without running the dev server, or when creating GitHub issues/PRs as part of a workflow. Always call `list_enabled_zapier_actions` first to confirm action keys before executing — keys are not guessable.

## Other notes

- A standing audit of this repo (issues B1–B33, severity-grouped) lives at `C:\Users\shaki\alkimi-issues.md` — snapshot dated 2026-05-11. Verify line numbers before acting on a specific issue ID since the code may have shifted.
- Vite plugin `@base44/vite-plugin` is doing more than bundling — it enables `hmrNotifier`, `navigationNotifier`, and `visualEditAgent` so the Base44 Builder can drive the dev server. Leave those flags alone unless you know why you're changing them.
