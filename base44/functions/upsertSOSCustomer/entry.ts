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
// Customer.jsonc field annotations + RLS):
const SOS_OWNED_OUTBOUND_FIELDS = [
  'name',
  'email',
  'phone',
  'billing_address',
  'shipping_address',
] as const;

// SOS API + idempotency strategy per Spike A + Spike D findings.
const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const PHONE_MAX_LENGTH = 80;
const ADDR_LINE_MAX_LENGTH = 200;
const ADDR_FIELD_MAX_LENGTH = 80;
const SEARCH_PAGE_SIZE = 50;

function err(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, error: message }, { status });
}

// ── Auth + IntegrationConfig (same pattern as testSOSConnection) ────────────

async function loadSOSConfig(base44: any) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
  return configs?.[0] ?? null;
}

async function refreshAccessToken(base44: any, config: any): Promise<string> {
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
  await base44.asServiceRole.entities.IntegrationConfig.update(config.id, {
    access_token: newToken,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    ...(json.expires_in ? { token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString() } : {}),
  });
  return newToken;
}

function sanitizeToken(raw: unknown): string {
  return String(raw || '').replace(new RegExp('[\\s\\x00-\\x1F\\x7F]', 'g'), '');
}

// ── Sanitized SOS error surfacing ────────────────────────────────────────────

// Map raw SOS / network errors to admin-visible sanitized strings. Never
// surface response bodies that might contain tokens or internal IDs.
function sanitizeSOSError(prefix: string, status?: number, _bodyText?: string): string {
  if (status !== undefined) {
    return `${prefix} (HTTP ${status})`;
  }
  return prefix;
}

// ── Field validation + sanitization ──────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function clampString(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.length === 0) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function sanitizeAddress(addr: any): Record<string, string> | null {
  if (!addr || typeof addr !== 'object') return null;
  const out: Record<string, string> = {};
  for (const k of ['line1', 'line2', 'city', 'stateProvince', 'postalCode', 'country']) {
    const max = k === 'line1' || k === 'line2' ? ADDR_LINE_MAX_LENGTH : ADDR_FIELD_MAX_LENGTH;
    const v = clampString(addr[k], max);
    if (v) out[k] = v;
  }
  return Object.keys(out).length === 0 ? null : out;
}

// Build the outbound payload from an Opus Customer row, using only SOS-owned
// fields per the ownership table. Defense-in-depth against accidental leakage
// of Opus-owned operational/CRM fields to SOS.
function buildSOSPayload(opusCustomer: any): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of SOS_OWNED_OUTBOUND_FIELDS) {
    const raw = opusCustomer[field];
    if (field === 'billing_address' || field === 'shipping_address') {
      const addr = sanitizeAddress(raw);
      if (addr) payload[field] = addr;
    } else {
      const max = field === 'email' ? EMAIL_MAX_LENGTH
                : field === 'phone' ? PHONE_MAX_LENGTH
                : NAME_MAX_LENGTH;
      const v = clampString(raw, max);
      if (v) payload[field] = v;
    }
  }
  return payload;
}

// ── SOS call helpers (with one auto-refresh on 401 per per-function checklist) ──

async function callSOS(
  base44: any,
  config: any,
  method: 'GET' | 'POST',
  path: string,
  bodyJson?: Record<string, unknown>,
): Promise<{ status: number; bodyText: string; bodyJson: any | null }> {
  let token = sanitizeToken(config.access_token);

  const fire = async () => {
    const opts: RequestInit = {
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
  let bodyJson: any = null;
  try { bodyJson = JSON.parse(bodyText); } catch { /* leave null */ }

  // SOS throttle quirk per Spike A: 200 + body message "Throttle limit exceeded".
  // Surface as caller-visible non-2xx so caller can retry. For #40's first
  // version we don't retry; future enhancement can add backoff loop.
  if (response.status === 200 && bodyJson?.message === 'Throttle limit exceeded') {
    return { status: 429, bodyText, bodyJson };
  }

  return { status: response.status, bodyText, bodyJson };
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
async function findExistingSOSCustomer(
  base44: any,
  config: any,
  opusCustomer: any,
): Promise<{ sos_id: string; sos_number?: string } | null> {
  const email = clampString(opusCustomer.email, EMAIL_MAX_LENGTH);
  const name = clampString(opusCustomer.name, NAME_MAX_LENGTH);

  // Step 1: search by email if present.
  if (email) {
    const path = `/customer?email=${encodeURIComponent(email)}&maxresults=${SEARCH_PAGE_SIZE}`;
    const res = await callSOS(base44, config, 'GET', path);
    if (res.status === 200 && Array.isArray(res.bodyJson?.data)) {
      // Defensive: filter client-side in case SOS silently ignored the email param.
      const matches = res.bodyJson.data.filter((c: any) =>
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

  // Step 2: search by name (exact match, case-insensitive).
  if (name) {
    // SOS doesn't document a name filter; use generic list + client filter.
    const path = `/customer?maxresults=${SEARCH_PAGE_SIZE}`;
    const res = await callSOS(base44, config, 'GET', path);
    if (res.status === 200 && Array.isArray(res.bodyJson?.data)) {
      const matches = res.bodyJson.data.filter((c: any) =>
        typeof c?.name === 'string' && c.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (matches.length === 1) {
        const m = matches[0];
        return { sos_id: String(m.id), sos_number: m.number ? String(m.number) : undefined };
      }
      if (matches.length > 1) {
        // Multiple name matches → ambiguous; require manual reconciliation
        // rather than guessing. Caller surfaces in sync_error.
        throw new Error(`Multiple SOS customers match name '${name}' — manual reconciliation required`);
      }
    } else if (res.status !== 200) {
      throw new Error(sanitizeSOSError('SOS search by name failed', res.status));
    }
  }

  return null;
}

async function createSOSCustomer(
  base44: any,
  config: any,
  payload: Record<string, unknown>,
): Promise<{ sos_id: string; sos_number?: string }> {
  const res = await callSOS(base44, config, 'POST', '/customer', payload);
  if (res.status !== 200 || !res.bodyJson || res.bodyJson.status === 'error') {
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
  let opusCustomerId: string | null = null;
  let base44: any = null;

  try {
    base44 = createClientFromRequest(req);

    // 1. Auth (per checklist item 1).
    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    // 2. Parse + validate input. opus_customer_id is the ONLY accepted field.
    let body: any = {};
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

    // 7. Mark Opus row as in-flight so a mid-call failure is visible to admins.
    await base44.asServiceRole.entities.Customer.update(opusCustomerId, {
      sync_status: 'pending',
    });

    // 8. Try to find an existing SOS customer (deterministic search) BEFORE
    // creating one. Spike D: explicit lookup-then-create is canonical;
    // createCustomerIfNotFound is the defensive fallback for OTHER functions,
    // not #40 itself.
    const found = await findExistingSOSCustomer(base44, config, opusCustomer);

    let result: { sos_id: string; sos_number?: string };
    let action: 'linked' | 'created';

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
  } catch (error: any) {
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
