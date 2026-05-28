import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// upsertSOSCustomer — task #40, Phase 3 Customer module.
//
// Ensures a SOS customer exists for the given Opus Customer record, and
// persists the resulting sos_id back to the Opus mirror. Idempotent by
// design — re-calls on the same Opus Customer return the cached sos_id
// without touching SOS.
//
// CONTRACT:
//   POST { opus_customer_id: string }
//
//   Response (admin-only callers):
//     200 { ok: true, customer_sos_id, customer_sos_number? }
//     400 { ok: false, code, error }   bad request / validation
//     401 { ok: false, code, error }   not authenticated
//     403 { ok: false, code, error }   not admin
//     404 { ok: false, code, error }   opus_customer_id not found
//     500 { ok: false, code, error }   generic — never echoes raw secrets
//
// SCOPE (locked per Codex 2026-05-27):
//   - admin-only manual trigger first; no scheduled caller in this function
//   - input is opus_customer_id ONLY; never accept sos_id from request body
//   - send ONLY SOS-owned fields outbound (per memory:alkimi-sos-sync-design
//     Customer field ownership table)
//   - never overwrite Opus-owned fields on the Customer row
//   - log/surface sync failure via sync_status + sync_error; never swallow
//
// FIELD-OWNERSHIP ALLOWLIST (mirrors the Customer ownership table; ANY
// change here requires updating memory:alkimi-sos-sync-design AND the
// Customer.jsonc field annotations + RLS).
//
// Outbound Opus → SOS key mapping (verified empirically during #40 live
// exercise on sandbox SOS customer 3):
//   Opus.name             → SOS.name
//   Opus.email            → SOS.email
//   Opus.phone            → SOS.phone
//   Opus.billing_address  → SOS.billing       (note: 'billing', no '_address')
//   Opus.shipping_address → SOS.shipping
// Inner address shape (both sides): line1..line5, city, stateProvince,
// postalCode, country. SOS UI exposes 5 line slots; Opus entity schema
// currently only stores line1/line2 — extra lines are tolerated as empty.
const SOS_OWNED_OUTBOUND_FIELDS = [
  'name',
  'email',
  'phone',
  'billing_address',
  'shipping_address',
];

// Opus → SOS top-level key rename for address fields. Non-address fields
// pass through with the same name.
const OPUS_TO_SOS_KEY = {
  billing_address: 'billing',
  shipping_address: 'shipping',
};

// SOS API + idempotency strategy per Spike A + Spike D findings.
const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const PHONE_MAX_LENGTH = 80;
const ADDR_LINE_MAX_LENGTH = 200;
const ADDR_FIELD_MAX_LENGTH = 80;
// SOS supports up to 200 per page (Spike A); we use that so a >200-customer
// account paginates fewer times and stays under the 500ms rate-limit pressure.
const SEARCH_PAGE_SIZE = 200;
// Safety cap on name-search pagination. If a SOS account ever has more than
// SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES customers AND the target match isn't
// found, throw "manual reconciliation required" rather than blindly creating
// a duplicate (#108 P1 fix; original 1da302d only checked page 1).
const SEARCH_MAX_PAGES = 25;  // 25 * 200 = 5000 customer ceiling
// Stale-lock recovery window. If a Customer row is stuck at sync_status =
// 'pending' for longer than this, treat as a crashed prior run and override
// (#108 P2 fix). 5min is generous given normal #40 runtime is sub-second.
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

// ── Auth + IntegrationConfig (same pattern as testSOSConnection) ────────────

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
    // Never echo the upstream OAuth body — could carry token-shaped data
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
  // P1 fix from #112 (Codex audit of #41): mutate `config` in place so
  // subsequent callSOS invocations read the fresh token. Without this, a
  // multi-call SOS session that triggers a 401 would re-read the stale
  // access_token from `config` on the next call, and — if SOS rotated the
  // refresh_token — fail outright on the next 401.
  config.access_token = newToken;
  if (json.refresh_token) config.refresh_token = json.refresh_token;
  if (json.expires_in) config.token_expires_at = patch.token_expires_at;
  return newToken;
}

function sanitizeToken(raw) {
  // NOTE: Builder normalizes `new RegExp('[\\s\\x00-\\x1F\\x7F]', 'g')` back
  // to this literal on redeploy. Keep the literal form so we don't fight
  // Builder on every push. The literal works at Deno runtime. (Lesson: the
  // local Write tool may corrupt \x7F if we edit this line later — read-only
  // safest, or use String.fromCharCode(0x7F) if a manual edit is needed.)
  return String(raw || '').replace(/[\s\x00-\x1F\x7F]/g, '');
}

// ── Sanitized SOS error surfacing ────────────────────────────────────────────

// Map raw SOS / network errors to admin-visible sanitized strings. Never
// surface response bodies that might contain tokens or internal IDs.
function sanitizeSOSError(prefix, status) {
  if (status !== undefined) {
    return `${prefix} (HTTP ${status})`;
  }
  return prefix;
}

// ── Field validation + sanitization ──────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function clampString(s, max) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length === 0) return null;
  return t.length > max ? t.slice(0, max) : t;
}

// Outbound allowlist for SOS address fields. Locked to the shape declared
// in Customer.jsonc (line1, line2, city, stateProvince, postalCode, country)
// per Codex P2 finding 2026-05-27 — forwarding undeclared nested fields
// breaks the entity-schema source-of-truth contract.
//
// NOTE: SOS itself accepts line1..line5. If Opus ever needs to mirror more
// than two lines, extend the Customer.jsonc billing_address/shipping_address
// `properties` block AND this allowlist together in the same change.
const ADDR_FIELDS = ['line1', 'line2', 'city', 'stateProvince', 'postalCode', 'country'];

function sanitizeAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  const out = {};
  for (const k of ADDR_FIELDS) {
    const max = k.startsWith('line') ? ADDR_LINE_MAX_LENGTH : ADDR_FIELD_MAX_LENGTH;
    const v = clampString(addr[k], max);
    if (v) out[k] = v;
  }
  return Object.keys(out).length === 0 ? null : out;
}

// Build the outbound payload from an Opus Customer row, using only SOS-owned
// fields per the ownership table. Defense-in-depth against accidental leakage
// of Opus-owned operational/CRM fields to SOS.
//
// Maps Opus field names to SOS field names per OPUS_TO_SOS_KEY (currently
// just the address field renames). Non-address fields pass through unchanged.
function buildSOSPayload(opusCustomer) {
  const payload = {};
  for (const field of SOS_OWNED_OUTBOUND_FIELDS) {
    const raw = opusCustomer[field];
    const outKey = OPUS_TO_SOS_KEY[field] || field;
    if (field === 'billing_address' || field === 'shipping_address') {
      const addr = sanitizeAddress(raw);
      if (addr) payload[outKey] = addr;
    } else {
      const max = field === 'email' ? EMAIL_MAX_LENGTH
                : field === 'phone' ? PHONE_MAX_LENGTH
                : NAME_MAX_LENGTH;
      const v = clampString(raw, max);
      if (v) payload[outKey] = v;
    }
  }
  return payload;
}

// ── SOS call helpers (with one auto-refresh on 401 per per-function checklist) ──

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

  // SOS throttle quirk per Spike A: 200 + body message "Throttle limit exceeded".
  // Surface as caller-visible non-2xx so caller can retry. For #40's first
  // version we don't retry; future enhancement can add backoff loop.
  if (response.status === 200 && parsedBody?.message === 'Throttle limit exceeded') {
    return { status: 429, bodyText, bodyJson: parsedBody };
  }

  return { status: response.status, bodyText, bodyJson: parsedBody };
}

// Search SOS for an existing customer by email (deterministic) then by
// name (less precise but better than blind create).
//
// IMPLEMENTATION NOTE: Spike A confirmed the standard ?updatedsince /
// ?archived / pagination params work uniformly on /customer; per-endpoint
// filter params like ?email= were NOT explicitly verified. We try the
// email filter first; if SOS silently-ignores it (Spike G behavior — would
// return ALL customers, not 0), we client-side filter the page to confirm
// the match. If we still don't find a precise match, fall back to name
// search. If neither finds a unique match, return null and caller will
// create a fresh customer.
async function findExistingSOSCustomer(base44, config, opusCustomer) {
  const email = clampString(opusCustomer.email, EMAIL_MAX_LENGTH);
  const name = clampString(opusCustomer.name, NAME_MAX_LENGTH);

  // Step 1: search by email if present.
  if (email) {
    const path = `/customer?email=${encodeURIComponent(email)}&maxresults=${SEARCH_PAGE_SIZE}`;
    const res = await callSOS(base44, config, 'GET', path);
    // #114: reject envelope-level errors even on HTTP 200 (per #42 spike —
    // SOS returns status: 'error' | 'invalid' | 'failed' for validation
    // and concurrency failures, sometimes with HTTP 200).
    const envelopeStatus = res.bodyJson?.status;
    if (envelopeStatus === 'error' || envelopeStatus === 'invalid' || envelopeStatus === 'failed') {
      throw new Error(sanitizeSOSError('SOS search by email rejected', res.status));
    }
    if (res.status === 200 && Array.isArray(res.bodyJson?.data)) {
      // Defensive: filter client-side in case SOS silently ignored the email param.
      const matches = res.bodyJson.data.filter((c) =>
        typeof c?.email === 'string' && c.email.trim().toLowerCase() === email.toLowerCase()
      );
      if (matches.length === 1) {
        const m = matches[0];
        return { sos_id: String(m.id), sos_number: m.number ? String(m.number) : undefined };
      }
      // Multiple email matches → ambiguous; fall through to name search rather
      // than guessing. Surface in caller via sync_error.
      if (matches.length > 1) {
        throw new Error(`Multiple SOS customers match email '${email}' — manual reconciliation required`);
      }
    } else if (res.status !== 200) {
      // Non-200 on search; surface but don't kill the function — caller decides.
      throw new Error(sanitizeSOSError('SOS search by email failed', res.status));
    }
  }

  // Step 2: search by name (exact match, case-insensitive). SOS doesn't
  // document a name filter, so we paginate through the customer list and
  // filter client-side. Per Spike A pagination invariant (start 1-based,
  // terminate when count < maxresults OR start + maxresults > totalCount).
  // Capped at SEARCH_MAX_PAGES; if exceeded without finding a match, throw
  // "manual reconciliation required" rather than create a duplicate
  // (#108 P1 fix — original code checked only page 1).
  if (name) {
    const targetName = name.toLowerCase();
    const seenMatches = [];
    let start = 1;
    let pagesScanned = 0;
    // Track exhaustion vs cap-hit separately (#109 P2 fix from Codex audit
    // of 04a83c5): if reachedEnd fires on exactly page SEARCH_MAX_PAGES we
    // exit the loop legitimately and the post-loop cap throw must NOT fire.
    // The throw only applies when we ran out of budget with more data
    // still available on the SOS side.
    let exhaustedNaturally = false;

    while (pagesScanned < SEARCH_MAX_PAGES) {
      const path = `/customer?start=${start}&maxresults=${SEARCH_PAGE_SIZE}`;
      const res = await callSOS(base44, config, 'GET', path);
      if (res.status !== 200) {
        throw new Error(sanitizeSOSError('SOS search by name failed', res.status));
      }
      // #114: also reject envelope-level errors even on HTTP 200 — without
      // this a 200-with-error response would produce an empty `data` array,
      // be treated as "no match", and the caller would create a DUPLICATE
      // SOS customer. Same shape check as #42's spike-validated set.
      const envelopeStatus = res.bodyJson?.status;
      if (envelopeStatus === 'error' || envelopeStatus === 'invalid' || envelopeStatus === 'failed') {
        throw new Error(sanitizeSOSError('SOS search by name rejected', res.status));
      }
      const data = Array.isArray(res.bodyJson?.data) ? res.bodyJson.data : [];
      const count = typeof res.bodyJson?.count === 'number' ? res.bodyJson.count : data.length;
      const totalCount = typeof res.bodyJson?.totalCount === 'number' ? res.bodyJson.totalCount : null;

      for (const c of data) {
        if (typeof c?.name === 'string' && c.name.trim().toLowerCase() === targetName) {
          seenMatches.push(c);
          // Short-circuit on ambiguity — multiple matches is a manual-
          // reconciliation case, no need to scan further pages.
          if (seenMatches.length > 1) {
            throw new Error(`Multiple SOS customers match name '${name}' — manual reconciliation required`);
          }
        }
      }

      pagesScanned += 1;

      // Pagination invariant per Spike A: end-of-data signals.
      const reachedEnd = count < SEARCH_PAGE_SIZE
        || (totalCount !== null && start + SEARCH_PAGE_SIZE > totalCount);
      if (reachedEnd) {
        exhaustedNaturally = true;
        break;
      }

      start += SEARCH_PAGE_SIZE;
    }

    if (seenMatches.length === 1) {
      const m = seenMatches[0];
      return { sos_id: String(m.id), sos_number: m.number ? String(m.number) : undefined };
    }

    // Only throw if we exited the loop because of the cap (still more
    // SOS data available we couldn't scan). If we naturally exhausted —
    // even if that happened on the last allowed page — fall through to
    // return null and let the caller create.
    if (!exhaustedNaturally && pagesScanned >= SEARCH_MAX_PAGES) {
      throw new Error(
        `Name search exceeded ${SEARCH_PAGE_SIZE * SEARCH_MAX_PAGES} customers without resolving '${name}' — ` +
        `manual reconciliation required (either set Customer.email for deterministic lookup or set Customer.sos_id by hand)`
      );
    }
    // Walked all pages, no match → caller will proceed to create.
  }

  return null;
}

async function createSOSCustomer(base44, config, payload) {
  const res = await callSOS(base44, config, 'POST', '/customer', payload);
  // #114: extend envelope-level error detection from 'error' only to also
  // cover 'invalid' and 'failed' (per #42 spike — SOS returns these for
  // name-uniqueness and id-mismatch failures, sometimes with HTTP 200).
  const envelopeStatus = res.bodyJson?.status;
  if (
    res.status !== 200 ||
    !res.bodyJson ||
    envelopeStatus === 'error' ||
    envelopeStatus === 'invalid' ||
    envelopeStatus === 'failed'
  ) {
    throw new Error(sanitizeSOSError('SOS customer create failed', res.status));
  }
  // SOS response envelope varies between list and single — for POST the
  // body shape is { id, name, ... } at root OR wrapped per the standard
  // envelope. Tolerate both.
  const obj = res.bodyJson.data ?? res.bodyJson;
  const sos_id = obj?.id != null ? String(obj.id) : null;
  if (!sos_id) {
    throw new Error('SOS customer create returned no id');
  }
  return {
    sos_id,
    sos_number: obj?.number ? String(obj.number) : undefined,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  let opusCustomerId = null;
  let base44 = null;

  try {
    base44 = createClientFromRequest(req);

    // 1. Auth (per checklist item 1).
    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    // 2. Parse + validate input. opus_customer_id is the ONLY accepted field.
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    opusCustomerId = body?.opus_customer_id;
    if (!isNonEmptyString(opusCustomerId)) {
      return err(400, 'bad_request', 'opus_customer_id required');
    }

    // 3. Load Opus Customer record via service role (RLS is admin-only;
    // even though auth gate passed, asServiceRole bypasses RLS entirely
    // for explicit server-side reads. Justified — this is the upsert
    // path's canonical lookup).
    const opusCustomer = await base44.asServiceRole.entities.Customer.get(opusCustomerId).catch(() => null);
    if (!opusCustomer) {
      return err(404, 'not_found', `Opus Customer ${opusCustomerId} not found`);
    }

    // 4. Pre-check existing sos_id — idempotency anchor (per Codex + Spike D).
    if (isNonEmptyString(opusCustomer.sos_id)) {
      return Response.json({
        ok: true,
        customer_sos_id: opusCustomer.sos_id,
        customer_sos_number: opusCustomer.sos_number || null,
        action: 'cached',
      });
    }

    // 5. Validate required outbound fields. SOS requires name; the rest are
    // recommended.
    if (!isNonEmptyString(opusCustomer.name)) {
      return err(400, 'missing_field', 'Customer.name is required for SOS upsert');
    }

    // 6. Load SOS config; bail if not configured.
    const config = await loadSOSConfig(base44);
    if (!config || !config.access_token) {
      return err(400, 'integration_not_configured', 'SOS IntegrationConfig missing or has no access_token');
    }

    // 7. ACQUIRE LOCK via atomic CAS (#108 P2 fix). Two concurrent upserts
    // for the same opus_customer_id could otherwise both pass the empty-
    // sos_id pre-check and both call SOS create → duplicate customer.
    //
    // Strategy (per #78 Step 0 spike — Base44 updateMany is atomic CAS at
    // the backend): atomically transition sync_status to 'pending' ONLY if
    // the row is NOT currently pending OR the pending state is stale
    // (5-min recovery window for crashed prior runs).
    //
    // If updated !== 1, the lock is held — re-read the row to distinguish
    // "race winner already finished" (sos_id now set → return cached) from
    // "another call still in flight" (return 409, caller can retry).
    const staleCutoff = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS).toISOString();
    const acquired = await base44.asServiceRole.entities.Customer.updateMany(
      {
        id: opusCustomerId,
        $or: [
          { sync_status: { $ne: 'pending' } },
          { updated_date: { $lt: staleCutoff } },
        ],
      },
      { $set: { sync_status: 'pending' } },
    );
    if (acquired?.updated !== 1) {
      // Lock contention. Re-read to determine fate.
      const fresh = await base44.asServiceRole.entities.Customer.get(opusCustomerId).catch(() => null);
      if (!fresh) {
        return err(404, 'not_found', `Opus Customer ${opusCustomerId} not found`);
      }
      if (isNonEmptyString(fresh.sos_id)) {
        // Race winner already persisted sos_id — return cached. The
        // idempotency contract holds across concurrent calls.
        return Response.json({
          ok: true,
          customer_sos_id: fresh.sos_id,
          customer_sos_number: fresh.sos_number || null,
          action: 'cached',
        });
      }
      // Still mid-flight by another call. Caller should retry shortly.
      return err(409, 'in_progress', 'Customer upsert already in progress; retry shortly');
    }

    // 8. Try to find an existing SOS customer (deterministic search) BEFORE
    // creating one. Spike D: explicit lookup-then-create is canonical;
    // createCustomerIfNotFound is the defensive fallback for OTHER functions,
    // not #40 itself.
    const found = await findExistingSOSCustomer(base44, config, opusCustomer);

    let result;
    let action;

    if (found) {
      result = found;
      action = 'linked';
    } else {
      const payload = buildSOSPayload(opusCustomer);
      result = await createSOSCustomer(base44, config, payload);
      action = 'created';
    }

    // 9. Persist sos_id + sos_number + sync metadata back to Opus.
    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.Customer.update(opusCustomerId, {
      sos_id: result.sos_id,
      ...(result.sos_number ? { sos_number: result.sos_number } : {}),
      sync_status: 'ok',
      sync_error: null,
      last_synced_at: nowIso,
    });

    return Response.json({
      ok: true,
      customer_sos_id: result.sos_id,
      customer_sos_number: result.sos_number || null,
      action,
    });
  } catch (error) {
    // Sanitize + persist a sync_error row state so admins can see what failed
    // without us swallowing the failure. The error message itself is sanitized
    // by sanitizeSOSError before throw points — but defense in depth: trim
    // and length-cap before persisting, and return a generic outer message
    // (per #107 lessons — never echo raw error.message in catch on token-
    // bearing functions).
    if (opusCustomerId && base44) {
      try {
        const msg = String(error?.message || 'Unknown sync error').slice(0, 500);
        await base44.asServiceRole.entities.Customer.update(opusCustomerId, {
          sync_status: 'error',
          sync_error: msg,
          // Deliberately NOT updating last_synced_at — staleness alarms should
          // fire if a Customer hasn't successfully synced in a while.
        });
      } catch { /* persistence error after API error — both surfaced via outer return */ }
    }
    // Outer response is generic. Admins read the sync_error column for detail.
    return err(500, 'internal', 'Internal error during customer upsert');
  }
});