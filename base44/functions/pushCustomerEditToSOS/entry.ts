import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// pushCustomerEditToSOS — task #42, Phase 3 admin write-through.
//
// Pushes admin-edited Opus Customer fields back to SOS for an already-linked
// customer. Requires Customer.sos_id to be populated (created by #40
// upsertSOSCustomer). The caller passes an explicit fields[] allowlist of
// SOS-owned slots to push — never auto-pushes the whole row.
//
// CONTRACT:
//   POST { opus_customer_id: string, fields: string[] }
//     fields[] subset of: 'name', 'email', 'phone', 'billing_address',
//     'shipping_address'
//
//   Response (admin-only callers):
//     200 { ok: true, sos_id, sync_token_new, updated_fields, opus_patch_applied }
//     400 not_linked | bad_request | invalid_field | missing_field | not_configured
//     401 unauthorized
//     403 forbidden
//     404 not_found (opus_customer_id)
//     409 conflict (SOS rejected with concurrency / stale-version)
//     500 internal (generic; never echoes raw secrets)
//
// SCOPE (locked per Codex 2026-05-27):
//   - admin-only manual trigger
//   - linked customers only (Customer.sos_id required); never creates a
//     SOS customer here (#40 owns create)
//   - explicit fields[] subset only; reject unknown keys
//   - send ONLY the allowlisted SOS-owned fields outbound
//   - never overwrite Opus-owned fields when applying the PUT response
//   - GET-then-PUT pattern (capture fresh syncToken per spike findings)
//   - SOS 'modified by someone else' / stale-syncToken → return 409 cleanly
//   - log/surface sync failure via sync_status + sync_error
//
// FIELD-OWNERSHIP ALLOWLIST (must match #40 / #41 lists — change all three
// together if Customer.jsonc's SOS-owned set changes).
const ALLOWED_FIELDS = ['name', 'email', 'phone', 'billing_address', 'shipping_address'];

// Opus → SOS key rename for outbound (mirrors #40 OPUS_TO_SOS_KEY).
const OPUS_TO_SOS_KEY = {
  billing_address: 'billing',
  shipping_address: 'shipping',
};

// SOS → Opus key rename for inbound mirror (mirrors #41 SOS_TO_OPUS_KEY).
const SOS_TO_OPUS_KEY = {
  billing: 'billing_address',
  shipping: 'shipping_address',
};

// Address field shape aligned to Customer.jsonc declared schema (per #110).
const ADDR_FIELDS = ['line1', 'line2', 'city', 'stateProvince', 'postalCode', 'country'];

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
const NAME_MAX_LENGTH = 200;
const EMAIL_MAX_LENGTH = 320;
const PHONE_MAX_LENGTH = 80;
const SOS_NUMBER_MAX_LENGTH = 80;
const ADDR_LINE_MAX_LENGTH = 200;
const ADDR_FIELD_MAX_LENGTH = 80;

// CAS lock stale-recovery window (same as #40).
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

// ── Token + SOS API helpers (inline per memory:alkimi-base44-sync) ───────────

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
  if (!res.ok) throw new Error(`Token refresh failed (HTTP ${res.status})`);
  const json = await res.json();
  const newToken = json.access_token;
  if (!newToken) throw new Error('Refresh response missing access_token');
  const patch = {
    access_token: newToken,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    ...(json.expires_in ? { token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString() } : {}),
  };
  await base44.asServiceRole.entities.IntegrationConfig.update(config.id, patch);
  // #112 fix: mutate config in place so subsequent callSOS sees fresh token.
  config.access_token = newToken;
  if (json.refresh_token) config.refresh_token = json.refresh_token;
  if (json.expires_in) config.token_expires_at = patch.token_expires_at;
  return newToken;
}

function sanitizeToken(raw) {
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
  if (response.status === 200 && parsedBody?.message === 'Throttle limit exceeded') {
    return { status: 429, bodyText, bodyJson: parsedBody };
  }
  return { status: response.status, bodyText, bodyJson: parsedBody };
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

function sanitizeAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  const out = {};
  for (const k of ADDR_FIELDS) {
    const max = k.startsWith('line') ? ADDR_LINE_MAX_LENGTH : ADDR_FIELD_MAX_LENGTH;
    const v = clampString(addr[k], max);
    if (v) out[k] = v;
  }
  // Return empty object (not null) — clearing is a legitimate update intent.
  return out;
}

// Build the outbound SOS payload for the requested subset of fields.
// Reads current Opus row values for the requested fields; applies the
// outbound key-rename + sanitization. NEVER sends fields not in `requestedFields`.
function buildSOSUpdatePayload(opusCustomer, requestedFields, sosId, syncToken) {
  const payload = {
    id: Number(sosId),
    syncToken: syncToken,
  };

  for (const field of requestedFields) {
    const sosKey = OPUS_TO_SOS_KEY[field] || field;
    if (field === 'billing_address' || field === 'shipping_address') {
      const addr = sanitizeAddress(opusCustomer[field]);
      // Allow {} to clear address on SOS side, mirror of #41 inbound semantics.
      payload[sosKey] = addr;
    } else {
      const raw = opusCustomer[field];
      const max = field === 'email' ? EMAIL_MAX_LENGTH
                : field === 'phone' ? PHONE_MAX_LENGTH
                : NAME_MAX_LENGTH;
      // SOS supports clearing scalar fields with empty string — mirror that.
      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        payload[sosKey] = '';
      } else {
        const clamped = clampString(raw, max);
        payload[sosKey] = clamped === null ? '' : clamped;
      }
    }
  }

  return payload;
}

// Inbound mirror update — apply ONLY the requested allowlist fields back to
// the Opus row from the PUT response. Three-state semantics per #111 P2 fix.
function applyMirrorScalarField(patch, sosCustomer, sosKey, opusKey, max) {
  if (!(sosKey in sosCustomer)) return;
  const raw = sosCustomer[sosKey];
  if (raw === null || raw === undefined) {
    patch[opusKey] = '';
    return;
  }
  const asString = typeof raw === 'string' ? raw : String(raw);
  const clamped = clampString(asString, max);
  patch[opusKey] = clamped === null ? '' : clamped;
}

function applyMirrorAddressField(patch, sosCustomer, sosKey, opusKey) {
  if (!(sosKey in sosCustomer)) return;
  patch[opusKey] = sanitizeAddress(sosCustomer[sosKey]) || {};
}

function buildOpusMirrorPatch(sosCustomer, requestedFields, nowIso) {
  const patch = {
    sync_status: 'ok',
    sync_error: null,
    last_synced_at: nowIso,
  };
  // Update sos_number opportunistically if SOS returned it in the response —
  // it's SOS-owned metadata that's safe to refresh on any successful PUT.
  applyMirrorScalarField(patch, sosCustomer, 'number', 'sos_number', SOS_NUMBER_MAX_LENGTH);

  for (const field of requestedFields) {
    const sosKey = Object.keys(OPUS_TO_SOS_KEY).includes(field) ? OPUS_TO_SOS_KEY[field] : field;
    if (field === 'billing_address' || field === 'shipping_address') {
      applyMirrorAddressField(patch, sosCustomer, sosKey, field);
    } else if (field === 'name') {
      applyMirrorScalarField(patch, sosCustomer, 'name', 'name', NAME_MAX_LENGTH);
    } else if (field === 'email') {
      applyMirrorScalarField(patch, sosCustomer, 'email', 'email', EMAIL_MAX_LENGTH);
    } else if (field === 'phone') {
      applyMirrorScalarField(patch, sosCustomer, 'phone', 'phone', PHONE_MAX_LENGTH);
    }
  }
  return patch;
}

// Detect SOS concurrency rejection. Matches the empirical 400 response shape
// captured during the #42 spike: { status: 'invalid', message: '...modified
// by someone else...' }.
function isSOSConcurrencyError(bodyJson) {
  if (!bodyJson || typeof bodyJson !== 'object') return false;
  const msg = typeof bodyJson.message === 'string' ? bodyJson.message.toLowerCase() : '';
  return (bodyJson.status === 'invalid' || bodyJson.status === 'failed')
    && (msg.includes('modified by someone else') || msg.includes('id of posted object is incorrect'));
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  let opusCustomerId = null;
  let base44 = null;

  try {
    base44 = createClientFromRequest(req);

    // 1. Auth.
    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    // 2. Parse + validate input.
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    opusCustomerId = body?.opus_customer_id;
    if (!isNonEmptyString(opusCustomerId)) {
      return err(400, 'bad_request', 'opus_customer_id required');
    }
    const requestedFields = body?.fields;
    if (!Array.isArray(requestedFields) || requestedFields.length === 0) {
      return err(400, 'bad_request', 'fields[] must be a non-empty array');
    }
    for (const f of requestedFields) {
      if (typeof f !== 'string' || !ALLOWED_FIELDS.includes(f)) {
        return err(400, 'invalid_field',
          `Field '${f}' is not pushable. Allowed: ${ALLOWED_FIELDS.join(', ')}`);
      }
    }

    // 3. Load Opus Customer row.
    const opusCustomer = await base44.asServiceRole.entities.Customer.get(opusCustomerId).catch(() => null);
    if (!opusCustomer) {
      return err(404, 'not_found', `Opus Customer ${opusCustomerId} not found`);
    }

    // 4. Require existing sos_id linkage. Never create here — that's #40's job.
    if (!isNonEmptyString(opusCustomer.sos_id)) {
      return err(400, 'not_linked',
        'Customer.sos_id is empty — call upsertSOSCustomer first to link the customer.');
    }

    // 5. Load SOS config.
    const config = await loadSOSConfig(base44);
    if (!config || !config.access_token) {
      return err(400, 'not_configured', 'SOS IntegrationConfig missing or has no access_token');
    }

    // 6. ACQUIRE LOCK on the Customer row (#40 pattern). Prevents two admin
    // edits on the same customer from racing each other and submitting stale
    // syncTokens.
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
      const fresh = await base44.asServiceRole.entities.Customer.get(opusCustomerId).catch(() => null);
      return err(409, 'in_progress',
        `Customer edit already in progress (lock held since ${fresh?.updated_date || 'unknown'}); retry shortly`);
    }

    // 7. GET current SOS state — needed for syncToken (optimistic concurrency).
    const getRes = await callSOS(base44, config, 'GET',
      `/customer/${encodeURIComponent(opusCustomer.sos_id)}`);
    if (getRes.status !== 200) {
      throw new Error(sanitizeSOSError('SOS customer fetch failed', getRes.status));
    }
    const sosCurrent = getRes.bodyJson?.data ?? getRes.bodyJson;
    if (!sosCurrent || typeof sosCurrent.syncToken !== 'number') {
      throw new Error('SOS GET response missing syncToken; cannot proceed safely');
    }
    const syncToken = sosCurrent.syncToken;

    // 8. Build PUT payload from Opus row values, restricted to requested fields.
    const putPayload = buildSOSUpdatePayload(opusCustomer, requestedFields, opusCustomer.sos_id, syncToken);

    // 9. PUT /customer/<sos_id>
    const putRes = await callSOS(base44, config, 'PUT',
      `/customer/${encodeURIComponent(opusCustomer.sos_id)}`, putPayload);

    // 10. Handle SOS concurrency rejection cleanly.
    if (putRes.status === 400 && isSOSConcurrencyError(putRes.bodyJson)) {
      // Release lock with error state.
      await base44.asServiceRole.entities.Customer.update(opusCustomerId, {
        sync_status: 'error',
        sync_error: 'SOS rejected the update: customer was modified externally. Refresh the Opus mirror via syncSOSCustomers and try again.',
      });
      return err(409, 'sos_concurrency_conflict',
        'SOS rejected the update: customer was modified externally. Refresh and try again.');
    }

    if (putRes.status !== 200) {
      throw new Error(sanitizeSOSError('SOS customer update failed', putRes.status));
    }

    // 11. Parse PUT response and update Opus mirror — restrict to requested
    // fields + always-safe sos_number refresh.
    const sosUpdated = putRes.bodyJson?.data ?? putRes.bodyJson;
    if (!sosUpdated || typeof sosUpdated !== 'object') {
      throw new Error('SOS PUT response missing data envelope');
    }
    const newSyncToken = typeof sosUpdated.syncToken === 'number' ? sosUpdated.syncToken : null;

    const nowIso = new Date().toISOString();
    const mirrorPatch = buildOpusMirrorPatch(sosUpdated, requestedFields, nowIso);
    await base44.asServiceRole.entities.Customer.update(opusCustomerId, mirrorPatch);

    return Response.json({
      ok: true,
      sos_id: opusCustomer.sos_id,
      sync_token_new: newSyncToken,
      updated_fields: requestedFields,
      opus_patch_applied: Object.keys(mirrorPatch),
    });
  } catch (error) {
    // Generic outer catch (per #107). Persist sync_status='error' + sanitized
    // sync_error so admins can see what failed without us swallowing it.
    if (opusCustomerId && base44) {
      try {
        const msg = String(error?.message || 'Unknown sync error').slice(0, 500);
        await base44.asServiceRole.entities.Customer.update(opusCustomerId, {
          sync_status: 'error',
          sync_error: msg,
        });
      } catch { /* persistence error after API error — both surfaced via outer return */ }
    }
    return err(500, 'internal', 'Internal error during customer push');
  }
});
