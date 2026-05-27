import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// syncSOSCustomers — task #41, Phase 3 inbound Customer sync.
//
// Pulls SOS customer updates since the last successful run and applies them
// to the matching Opus Customer mirror rows. Update-only: rows with no
// matching sos_id are SKIPPED (mass-create happens in #69 backfill).
// Symmetric counterpart to #40 upsertSOSCustomer's outbound path.
//
// CONTRACT:
//   POST {}  (no body; opus_customer_id is NOT accepted — this is a sweep)
//
//   Response (admin-only callers):
//     200 { ok: true, action: 'completed', total_seen, updated,
//           skipped_no_match, errors: [...] }
//     200 { ok: true, action: 'disabled' }         SyncState.enabled === false
//     200 { ok: true, action: 'locked', held_by, lock_acquired_at }
//     401 { ok: false, code, error }   not authenticated
//     403 { ok: false, code, error }   not admin
//     500 { ok: false, code, error }   generic — never echoes raw secrets
//
// SCOPE (locked per Codex 2026-05-27):
//   - admin-only manual trigger first; scheduler wiring deferred
//   - input is the empty body — never accept any sos_id / opus_customer_id
//   - update ONLY SOS-owned fields on matched Opus rows (allowlist below)
//   - never overwrite Opus-owned fields (internal_notes, relationship_notes,
//     tags, lead_source, follow_up_date, customer_status, etc.)
//   - update-only: missing Opus match → skip (#69 owns mass create)
//   - sync failures surface via SyncState.last_error + per-row sync_status
//
// FIELD-OWNERSHIP ALLOWLIST (mirror of #40 outbound — both lists must move
// together if Customer.jsonc's SOS-owned set changes):
//   SOS.name             → Opus.name
//   SOS.email            → Opus.email
//   SOS.phone            → Opus.phone
//   SOS.billing.<addr>   → Opus.billing_address.<addr>
//   SOS.shipping.<addr>  → Opus.shipping_address.<addr>
//   SOS.number           → Opus.sos_number
//
// SOS → Opus key rename (inverse of #40's OPUS_TO_SOS_KEY):
const SOS_TO_OPUS_KEY = {
  billing: 'billing_address',
  shipping: 'shipping_address',
};

// Address fields aligned with Customer.jsonc declared schema (per #110
// Codex P2 fix — never forward fields not declared in the entity schema).
const ADDR_FIELDS = ['line1', 'line2', 'city', 'stateProvince', 'postalCode', 'country'];

// SOS API + pagination constants per Spike A invariant.
const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
const SYNC_PAGE_SIZE = 200;
// Safety cap. 50 pages * 200 = 10000 customers per single run. If exceeded,
// the run completes the pages it scanned, advances the cursor only up to
// the last-confirmed-page upper bound (NOT the run-start cursor), so the
// next run picks up where this left off. Cap exists to bound run time.
const SYNC_MAX_PAGES = 50;

// Field length caps mirror #40 outbound — applied defensively to inbound
// values too, since SOS could surface unexpected lengths via webhooks etc.
const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const PHONE_MAX_LENGTH = 80;
const SOS_NUMBER_MAX_LENGTH = 80;
const ADDR_LINE_MAX_LENGTH = 200;
const ADDR_FIELD_MAX_LENGTH = 80;

// Lock + cursor defaults — must match SyncState.jsonc.
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_CURSOR_SAFETY_MARGIN_SECONDS = 30;

// data_env is SERVER-DERIVED per per-function checklist item #4 (never
// trust request body). For now hardcoded to 'prod' — when staging/dev
// environments exist, derive from a process env var or a Base44 const.
const DATA_ENV = 'prod';
const SERVICE = 'SOS';
const MODULE = 'customer';

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

// ── Token + SOS API helpers (inline per memory:alkimi-base44-sync ──────────
//    base44/shared/ files do NOT bundle into Deno functions)

async function loadSOSConfig(base44) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
  return configs?.[0] ?? null;
}

async function refreshAccessToken(base44, config) {
  const res = await fetch('https://api.sosinventory.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token || '',
      client_id: config.client_id || '',
      client_secret: config.client_secret || '',
    }),
  });
  if (!res.ok) {
    // Never echo upstream OAuth body — could carry token-shaped data
    // or client_secret context. Generic per task #33.
    throw new Error(`Token refresh failed (HTTP ${res.status})`);
  }
  const json = await res.json();
  const newToken = json.access_token;
  if (!newToken) throw new Error('Refresh response missing access_token');
  const patch = {
    access_token: newToken,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    ...(json.expires_in ? { token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString() } : {}),
  };
  await base44.asServiceRole.entities.IntegrationConfig.update(config.id, patch);
  // P1 fix from Codex audit of #41 (commit 09449dc..ff6e0dc): mutate `config`
  // in place so subsequent callSOS invocations read the fresh token. Without
  // this, a multi-page sweep that triggers a 401 on page N would re-read the
  // stale access_token from `config` on page N+1, and — if SOS rotated the
  // refresh_token — fail outright on the next 401 because the in-memory
  // refresh_token is also stale.
  config.access_token = newToken;
  if (json.refresh_token) config.refresh_token = json.refresh_token;
  if (json.expires_in) config.token_expires_at = patch.token_expires_at;
  return newToken;
}

function sanitizeToken(raw) {
  // See #40 note on Write-tool corruption of \x7F; keep this as the literal
  // form (Builder normalizes to this) and avoid Edit/Write touching it.
  return String(raw || '').replace(/[\s\x00-\x1F\x7F]/g, '');
}

function sanitizeSOSError(prefix, status) {
  if (status !== undefined) return `${prefix} (HTTP ${status})`;
  return prefix;
}

async function callSOS(base44, config, method, path, bodyJson) {
  let token = sanitizeToken(config.access_token);

  const fire = async () => {
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(bodyJson ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(bodyJson ? { body: JSON.stringify(bodyJson) } : {}),
    };
    return fetch(`${SOS_API_BASE}${path}`, opts);
  };

  let response = await fire();
  if (response.status === 401) {
    token = await refreshAccessToken(base44, config);
    response = await fire();
  }

  const bodyText = await response.text();
  let parsedBody = null;
  try { parsedBody = JSON.parse(bodyText); } catch { /* leave null */ }

  // SOS throttle quirk per Spike A: 200 + body.message === 'Throttle limit exceeded'.
  if (response.status === 200 && parsedBody?.message === 'Throttle limit exceeded') {
    return { status: 429, bodyText, bodyJson: parsedBody };
  }

  return { status: response.status, bodyText, bodyJson: parsedBody };
}

// ── Field sanitization (defensive on inbound; SOS shouldn't send bad data
//    but be paranoid since this writes to our mirror) ───────────────────────

function clampString(s, max) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length === 0) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function sanitizeAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  const out = {};
  for (const k of ADDR_FIELDS) {
    const max = k.startsWith('line') ? ADDR_LINE_MAX_LENGTH : ADDR_FIELD_MAX_LENGTH;
    const v = clampString(addr[k], max);
    if (v) out[k] = v;
  }
  // Allow empty address: SOS may legitimately clear an address. Return {} so
  // Opus row reflects "no address" rather than retaining a stale one.
  return out;
}

// Apply a single SOS scalar field to the patch. Three-state semantics
// (P2 fix from Codex audit of #41):
//   - key ABSENT from sosCustomer  → don't touch Opus (preserves the mirror)
//   - key present and non-empty    → write the clamped value
//   - key present but null/empty   → CLEAR the Opus value (SOS cleared it)
// This ensures cleared SOS-owned fields propagate to the mirror.
function applyMirrorScalarField(patch, sosCustomer, sosKey, opusKey, max) {
  if (!(sosKey in sosCustomer)) return;
  const raw = sosCustomer[sosKey];
  if (raw === null || raw === undefined) {
    patch[opusKey] = '';
    return;
  }
  // sos_number may arrive as a number from SOS; coerce to string first.
  const asString = typeof raw === 'string' ? raw : String(raw);
  const clamped = clampString(asString, max);
  patch[opusKey] = clamped === null ? '' : clamped;
}

// Apply an address. Symmetric three-state semantics:
//   - key absent       → don't touch Opus
//   - key present      → write sanitized object (may be {} if SOS cleared)
// sanitizeAddress returns {} for an object with no non-empty inner fields,
// which writes an empty address to Opus — clearing the mirror.
function applyMirrorAddressField(patch, sosCustomer, sosKey, opusKey) {
  if (!(sosKey in sosCustomer)) return;
  patch[opusKey] = sanitizeAddress(sosCustomer[sosKey]) || {};
}

// Build the patch to apply to the matched Opus Customer row. SOS-owned
// fields only; the allowlist enforces no leakage of unknown SOS fields
// into Opus.
function buildOpusPatch(sosCustomer, nowIso) {
  const patch = {
    sync_status: 'ok',
    sync_error: null,
    last_synced_at: nowIso,
  };

  applyMirrorScalarField(patch, sosCustomer, 'name', 'name', NAME_MAX_LENGTH);
  applyMirrorScalarField(patch, sosCustomer, 'email', 'email', EMAIL_MAX_LENGTH);
  applyMirrorScalarField(patch, sosCustomer, 'phone', 'phone', PHONE_MAX_LENGTH);
  applyMirrorScalarField(patch, sosCustomer, 'number', 'sos_number', SOS_NUMBER_MAX_LENGTH);

  // Address rename: SOS.billing → Opus.billing_address (per SOS_TO_OPUS_KEY).
  applyMirrorAddressField(patch, sosCustomer, 'billing', SOS_TO_OPUS_KEY.billing);
  applyMirrorAddressField(patch, sosCustomer, 'shipping', SOS_TO_OPUS_KEY.shipping);

  return patch;
}

// ── SyncState helpers — load, acquire-lock, release-lock, persist progress ──

async function loadSyncState(base44) {
  const rows = await base44.asServiceRole.entities.SyncState.filter({
    service: SERVICE,
    module: MODULE,
    data_env: DATA_ENV,
  });
  return rows?.[0] ?? null;
}

async function ensureSyncStateRow(base44) {
  const existing = await loadSyncState(base44);
  if (existing) return existing;
  const created = await base44.asServiceRole.entities.SyncState.create({
    service: SERVICE,
    module: MODULE,
    data_env: DATA_ENV,
    cursor_type: 'updated_since',
    cursor_safety_margin_seconds: DEFAULT_CURSOR_SAFETY_MARGIN_SECONDS,
    is_locked: false,
    backfill_in_progress: false,
    enabled: true,
    pagination_resume_start: 0,
    pending_cursor_value: '',
  });
  return created;
}

// Atomic CAS lock acquisition per #78 Step 0 spike. Returns the SyncState
// row on success, or null on contention. Stale locks (older than
// STALE_LOCK_THRESHOLD_MS) are overridden.
async function acquireSyncLock(base44, syncStateRow, runId, nowIso) {
  const staleCutoff = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS).toISOString();
  const result = await base44.asServiceRole.entities.SyncState.updateMany(
    {
      id: syncStateRow.id,
      $or: [
        { is_locked: false },
        { lock_acquired_at: { $lt: staleCutoff } },
      ],
    },
    {
      $set: {
        is_locked: true,
        lock_acquired_at: nowIso,
        lock_owner_run_id: runId,
        last_run_at: nowIso,
      },
    },
  );
  return result?.updated === 1;
}

// Owner-scoped release (only release a lock WE hold).
async function releaseSyncLock(base44, syncStateRow, runId, extraPatch) {
  await base44.asServiceRole.entities.SyncState.updateMany(
    {
      id: syncStateRow.id,
      lock_owner_run_id: runId,
    },
    {
      $set: {
        is_locked: false,
        lock_owner_run_id: '',
        ...(extraPatch || {}),
      },
    },
  );
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  let base44 = null;
  let syncStateRow = null;
  let runId = null;

  try {
    base44 = createClientFromRequest(req);

    // 1. Auth gate — admin-only for the manual-trigger phase.
    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    // 2. Consume body (must not accept any input that could narrow scope
    // or override scheduling). data_env is SERVER-DERIVED per checklist #4.
    try { await req.json(); } catch { /* body optional, ignore */ }

    // 3. Ensure SyncState row exists for (SOS, customer, prod).
    syncStateRow = await ensureSyncStateRow(base44);

    // 4. Disable switch: respect SyncState.enabled. Default true if absent
    // (backward compat per schema description).
    if (syncStateRow.enabled === false) {
      return Response.json({ ok: true, action: 'disabled' });
    }

    // 5. Backfill coordination — if a backfill (#69) is running, defer.
    // Backfill holds the lock too; this is a fast-path bail-out.
    if (syncStateRow.backfill_in_progress === true) {
      return Response.json({
        ok: true,
        action: 'deferred_for_backfill',
        backfill_in_progress: true,
      });
    }

    // 6. Acquire atomic CAS lock per #78 Step 0 pattern.
    runId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nowIso = new Date().toISOString();
    const acquired = await acquireSyncLock(base44, syncStateRow, runId, nowIso);
    if (!acquired) {
      // Re-read to surface who holds it.
      const fresh = await loadSyncState(base44);
      return Response.json({
        ok: true,
        action: 'locked',
        held_by_run_id: fresh?.lock_owner_run_id || null,
        lock_acquired_at: fresh?.lock_acquired_at || null,
      });
    }

    // 7. Load SOS config; bail if not configured.
    const config = await loadSOSConfig(base44);
    if (!config || !config.access_token) {
      await releaseSyncLock(base44, syncStateRow, runId, {
        last_error: 'SOS IntegrationConfig missing or has no access_token',
        last_error_at: new Date().toISOString(),
      });
      return err(400, 'integration_not_configured', 'SOS IntegrationConfig missing or has no access_token');
    }

    // 8. Cursor + resume state. P1 fix from Codex audit of #41: when a
    // previous run hit SYNC_MAX_PAGES, it persisted pagination_resume_start
    // and pending_cursor_value. This run continues from that offset using
    // the SAME updatedsince + the SAME pending nextCursor — preventing the
    // infinite loop bug (re-processing first 10000 records forever) AND
    // preventing a data-loss gap when the cursor finally advances.
    const safetyMarginSeconds = typeof syncStateRow.cursor_safety_margin_seconds === 'number'
      ? syncStateRow.cursor_safety_margin_seconds
      : DEFAULT_CURSOR_SAFETY_MARGIN_SECONDS;

    const isResuming = typeof syncStateRow.pagination_resume_start === 'number'
      && syncStateRow.pagination_resume_start > 1
      && isNonEmptyString(syncStateRow.pending_cursor_value);

    let nextCursorValue;
    if (isResuming) {
      // Use the pending cursor stored at the cap-hit run; do NOT recompute
      // from `now` (would leave a data-loss gap).
      nextCursorValue = syncStateRow.pending_cursor_value;
    } else {
      const cursorAtRunStart = new Date(Date.now() - safetyMarginSeconds * 1000);
      // SOS expects 'YYYY-MM-DDTHH:MM:SS' in UTC, no timezone suffix per
      // Spike A docs. Strip milliseconds + 'Z' since SOS may or may not parse.
      nextCursorValue = cursorAtRunStart.toISOString().replace(/\.\d{3}Z$/, '');
    }

    const cursorValue = isNonEmptyString(syncStateRow.cursor_value)
      ? syncStateRow.cursor_value
      : null;

    // 9. Sweep paginated SOS customer list. Resume from stored offset if a
    // previous run hit the cap; otherwise start at 1.
    let start = isResuming ? syncStateRow.pagination_resume_start : 1;
    let pagesScanned = 0;
    let exhaustedNaturally = false;
    let totalSeen = 0;
    let updated = 0;
    let skippedNoMatch = 0;
    const errors = [];

    while (pagesScanned < SYNC_MAX_PAGES) {
      const params = new URLSearchParams({
        start: String(start),
        maxresults: String(SYNC_PAGE_SIZE),
      });
      if (cursorValue) params.set('updatedsince', cursorValue);

      const path = `/customer?${params.toString()}`;
      const res = await callSOS(base44, config, 'GET', path);
      if (res.status !== 200) {
        throw new Error(sanitizeSOSError('SOS customer sweep failed', res.status));
      }
      const data = Array.isArray(res.bodyJson?.data) ? res.bodyJson.data : [];
      const count = typeof res.bodyJson?.count === 'number' ? res.bodyJson.count : data.length;
      const totalCount = typeof res.bodyJson?.totalCount === 'number' ? res.bodyJson.totalCount : null;

      // Per-record processing. One bad row should NOT kill the whole sweep
      // (per Codex pass / production-reliability principle "Optimize for
      // contained failure"). Capture per-row errors, continue.
      for (const sosCustomer of data) {
        totalSeen += 1;
        const sosId = sosCustomer?.id != null ? String(sosCustomer.id) : null;
        if (!sosId) {
          errors.push({ sos_id: null, error: 'SOS record missing id field' });
          continue;
        }

        try {
          // Match by sos_id only (per design: no row creation here; #69 owns).
          const opusRows = await base44.asServiceRole.entities.Customer.filter({ sos_id: sosId });
          if (!opusRows || opusRows.length === 0) {
            skippedNoMatch += 1;
            continue;
          }
          if (opusRows.length > 1) {
            // Duplicate sos_id in Opus — should not happen given #40's CAS
            // lock, but tolerate without crashing the sweep.
            errors.push({
              sos_id: sosId,
              error: `Multiple Opus rows reference sos_id=${sosId} — manual reconciliation required`,
            });
            continue;
          }

          const opusRow = opusRows[0];
          const patch = buildOpusPatch(sosCustomer, new Date().toISOString());
          await base44.asServiceRole.entities.Customer.update(opusRow.id, patch);
          updated += 1;
        } catch (rowErr) {
          // Persist per-row failure on the Opus row when we can identify it,
          // but never throw out of the sweep.
          const sanitized = String(rowErr?.message || 'row update failed').slice(0, 500);
          errors.push({ sos_id: sosId, error: sanitized });
          try {
            const matchRows = await base44.asServiceRole.entities.Customer.filter({ sos_id: sosId });
            if (matchRows?.length === 1) {
              await base44.asServiceRole.entities.Customer.update(matchRows[0].id, {
                sync_status: 'error',
                sync_error: sanitized,
                // Do NOT update last_synced_at on error — staleness alarms
                // should fire if a Customer hasn't successfully synced.
              });
            }
          } catch { /* secondary failure; surfaced in errors[] */ }
        }
      }

      pagesScanned += 1;

      // Pagination terminator per Spike A.
      const reachedEnd = count < SYNC_PAGE_SIZE
        || (totalCount !== null && start + SYNC_PAGE_SIZE > totalCount);
      if (reachedEnd) {
        exhaustedNaturally = true;
        break;
      }
      start += SYNC_PAGE_SIZE;
    }

    // 10. Cursor advancement rules (P1 fix from Codex audit of #41):
    //   - Naturally exhausted → advance cursor_value to nextCursorValue
    //     AND clear pagination_resume_start + pending_cursor_value.
    //   - Cap hit → persist `start` (next offset to resume from) + the
    //     nextCursorValue (so the eventual exhaustion advances to the
    //     correct cursor without a data-loss gap). cursor_value stays put.
    //   - Per-row errors are NOT cursor failures: persisted on individual
    //     Opus rows; cursor still advances on natural exhaustion.
    const finalPatch = {};
    if (exhaustedNaturally) {
      finalPatch.cursor_value = nextCursorValue;
      finalPatch.pagination_resume_start = 0;  // cleared (default-treated as 1)
      finalPatch.pending_cursor_value = '';     // cleared
      finalPatch.last_success_at = new Date().toISOString();
      finalPatch.last_error = '';
      finalPatch.last_error_at = '';
    } else {
      // Cap hit. Persist progress so next run resumes mid-sweep.
      finalPatch.pagination_resume_start = start;       // next offset
      finalPatch.pending_cursor_value = nextCursorValue; // promote on eventual exhaustion
      finalPatch.last_error = `Sweep cap hit after ${pagesScanned} pages (${pagesScanned * SYNC_PAGE_SIZE} records scanned); resume offset persisted. Re-run to continue.`;
      finalPatch.last_error_at = new Date().toISOString();
    }

    await releaseSyncLock(base44, syncStateRow, runId, finalPatch);

    return Response.json({
      ok: true,
      action: 'completed',
      total_seen: totalSeen,
      updated,
      skipped_no_match: skippedNoMatch,
      errors,
      pages_scanned: pagesScanned,
      exhausted_naturally: exhaustedNaturally,
      cursor_advanced: exhaustedNaturally,
      resumed_from_offset: isResuming ? syncStateRow.pagination_resume_start : null,
      pagination_resume_start: exhaustedNaturally ? null : start,
    });
  } catch (error) {
    // Generic outer catch — never echo error.message (per #107 lesson:
    // token-bearing patches in callSOS pipeline could leak).
    if (base44 && syncStateRow && runId) {
      try {
        await releaseSyncLock(base44, syncStateRow, runId, {
          last_error: String(error?.message || 'Unknown sync error').slice(0, 500),
          last_error_at: new Date().toISOString(),
        });
      } catch { /* lock release failed; logs only */ }
    }
    return err(500, 'internal', 'Internal error during customer sync');
  }
});
