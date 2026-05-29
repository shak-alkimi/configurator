import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// createSOSSalesOrder — DEPRECATED COMPATIBILITY ALIAS for pushProjectToSOS
// (task #43). This file mirrors base44/functions/pushProjectToSOS/entry.ts
// verbatim with ONE exception: every response carries an X-Alkimi-Deprecated
// header so callers (and log analysis) can identify lingering use of the
// old endpoint name.
//
// =====================================================================
// AUDIT RULE: drift between this file and pushProjectToSOS/entry.ts is a
// P1 audit finding while the alias exists. Any fix applied to one MUST be
// applied identically to the other. The only legitimate difference is the
// addDeprecationHeader wrapper on each Response.json call.
// =====================================================================
//
// REMOVAL CRITERIA: drop this alias once Builder Automations + production
// log analysis confirm no caller hits the createSOSSalesOrder endpoint name.
//
// See pushProjectToSOS/entry.ts for the canonical contract, behavior,
// status branching, idempotency, linkage requirements, and scope notes.

const PUSH_ENABLED = true;  // Edit + republish to halt all pushes globally.

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
// P1 fix from Codex audit of #43 (commit bc59ec7): extended from 5min to 15min.
// See pushProjectToSOS for the full rationale. Keep in lockstep with the
// canonical handler.
const STALE_LOCK_THRESHOLD_MS = 15 * 60 * 1000;

const PUSHABLE_STATUSES = new Set(['submitted', 'approved', 'in_fulfillment', 'shipped']);
const TERMINAL_STATUSES = new Set(['in_fulfillment', 'shipped']);

const DEPRECATION_HEADER_VALUE =
  'createSOSSalesOrder is a deprecated alias for pushProjectToSOS (task #43). ' +
  'Update callers to invoke pushProjectToSOS directly.';

// Sole intentional difference vs pushProjectToSOS: stamp every response
// with a deprecation header. Body shape stays identical so existing
// callers don't break.
function addDeprecationHeader(response) {
  response.headers.set('X-Alkimi-Deprecated', DEPRECATION_HEADER_VALUE);
  return response;
}

function err(status, code, message) {
  return addDeprecationHeader(
    Response.json({ ok: false, code, error: message }, { status }),
  );
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// ── Token + SOS API helpers ────────────────────────────────────────────────

function sanitizeToken(raw) {
  return String(raw || '').replace(/[\s\x00-\x1F\x7F]/g, '');
}

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
  // #112 fix: mutate config in place so subsequent callSOS reads see fresh token.
  config.access_token = newToken;
  if (json.refresh_token) config.refresh_token = json.refresh_token;
  if (json.expires_in) config.token_expires_at = patch.token_expires_at;
  return newToken;
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

// ── Line-item construction ─────────────────────────────────────────────────

function buildLineItems(runs) {
  return runs.map((run, i) => ({
    linenumber: i + 1,
    name: [run.run_name, run.location, run.cct, run.tape_output, run.channel_type]
      .filter(Boolean).join(' — '),
    quantity: run.length_feet || 1,
    unit: 'ft',
    description: [
      run.product_type,
      run.lens ? `Lens: ${run.lens}` : null,
      run.finish ? `Finish: ${run.finish}` : null,
      run.notes || null,
    ].filter(Boolean).join(', '),
  }));
}

function buildSOSBody(project, customer, lineItems) {
  return {
    customer: {
      id: Number(customer.sos_id),
      ...(customer.name ? { name: customer.name } : {}),
    },
    date: new Date().toISOString().split('T')[0],
    ponumber: project.quote_number || '',
    description: project.project_name || '',
    lines: lineItems,
  };
}

// ── Atomic CAS lock on Project.sos_push_in_progress ─────────────────────────

async function acquirePushLock(base44, projectId, nowIso) {
  const staleCutoff = new Date(Date.now() - STALE_LOCK_THRESHOLD_MS).toISOString();
  const result = await base44.asServiceRole.entities.Project.updateMany(
    {
      id: projectId,
      $or: [
        { sos_push_in_progress: { $ne: true } },
        { sos_push_in_progress_at: { $lt: staleCutoff } },
      ],
    },
    {
      $set: {
        sos_push_in_progress: true,
        sos_push_in_progress_at: nowIso,
      },
    },
  );
  return result?.updated === 1;
}

async function releasePushLock(base44, projectId, extraPatch) {
  await base44.asServiceRole.entities.Project.update(projectId, {
    sos_push_in_progress: false,
    ...(extraPatch || {}),
  });
}

// DATA PARITY NOTE — see pushProjectToSOS for full rationale. Cached returns
// surface this note so callers know they aren't asserting content parity.
// Keep byte-identical with the canonical handler.
const DATA_PARITY_NOTE =
  'Opus state may have diverged from SOS since the original push. This call ' +
  'did not verify content parity (no PUT/refresh against the SOS record). ' +
  'Content-hash drift detection is a deferred follow-up; in the meantime, ' +
  'use SOS UI / reconcile flow to confirm parity before relying on cached state.';

// ── Main handler (verbatim parity with pushProjectToSOS) ───────────────────

Deno.serve(async (req) => {
  let projectId = null;
  let base44 = null;
  let lockAcquired = false;

  try {
    base44 = createClientFromRequest(req);

    if (!PUSH_ENABLED) {
      return err(503, 'disabled',
        'pushProjectToSOS is disabled. Set PUSH_ENABLED=true + republish to re-enable.');
    }

    const user = await base44.auth.me();
    if (!user || !user.email) {
      return err(401, 'unauthorized', 'Unauthorized');
    }

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    projectId = body?.event?.entity_id || body?.project_id;
    if (!isNonEmptyString(projectId)) {
      return err(400, 'bad_request', 'project_id required');
    }

    const project = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
    if (!project) {
      return err(404, 'not_found', `Project ${projectId} not found`);
    }
    const isAdmin = user.role === 'admin';
    const isOwner = project.created_by && project.created_by === user.email;
    if (!isAdmin && !isOwner) {
      return err(403, 'forbidden', 'Not authorized for this project');
    }

    const status = project.status || 'draft';
    if (status === 'draft' || !PUSHABLE_STATUSES.has(status)) {
      return err(400, 'not_submittable',
        `Project status '${status}' is not pushable. Submit the project first via the Configurator.`);
    }
    if (TERMINAL_STATUSES.has(status)) {
      return addDeprecationHeader(Response.json({
        ok: true,
        action: 'terminal',
        project_status: status,
        sos_estimate_id: project.sos_estimate_id || null,
        sos_order_id: project.sos_order_id || null,
      }));
    }

    // Cached returns honest about NOT verifying content parity — see
    // DATA_PARITY_NOTE above. Mirrors pushProjectToSOS.
    if (status === 'submitted' && isNonEmptyString(project.sos_estimate_id)) {
      return addDeprecationHeader(Response.json({
        ok: true,
        action: 'estimate_cached',
        sos_estimate_id: project.sos_estimate_id,
        sos_estimate_number: project.sos_estimate_number || null,
        data_parity_verified: false,
        data_parity_note: DATA_PARITY_NOTE,
      }));
    }
    if (status === 'approved' && isNonEmptyString(project.sos_order_id)) {
      return addDeprecationHeader(Response.json({
        ok: true,
        action: 'salesorder_cached',
        sos_order_id: project.sos_order_id,
        sos_order_number: project.sos_order_number || null,
        data_parity_verified: false,
        data_parity_note: DATA_PARITY_NOTE,
      }));
    }

    if (!isNonEmptyString(project.opus_customer_id)) {
      return err(400, 'customer_not_linked',
        'Project has no Customer linkage (opus_customer_id is empty). ' +
        'Use the admin UI to link a Customer record first.');
    }

    const customer = await base44.asServiceRole.entities.Customer.get(project.opus_customer_id).catch(() => null);
    if (!customer) {
      return err(400, 'customer_dangling',
        `Project references Customer ${project.opus_customer_id} but the record is missing. ` +
        `Re-link manually via admin UI.`);
    }
    if (!isNonEmptyString(customer.sos_id)) {
      return err(400, 'customer_not_in_sos',
        `Customer "${customer.name || customer.id}" has not been pushed to SOS yet. ` +
        `Run upsertSOSCustomer for this Customer first.`);
    }

    const config = await loadSOSConfig(base44);
    if (!config || !config.access_token) {
      return err(400, 'integration_not_configured',
        'SOS IntegrationConfig missing or has no access_token');
    }

    const nowIso = new Date().toISOString();
    lockAcquired = await acquirePushLock(base44, projectId, nowIso);
    if (!lockAcquired) {
      const fresh = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
      if (status === 'submitted' && isNonEmptyString(fresh?.sos_estimate_id)) {
        return addDeprecationHeader(Response.json({
          ok: true,
          action: 'estimate_cached',
          sos_estimate_id: fresh.sos_estimate_id,
          sos_estimate_number: fresh.sos_estimate_number || null,
          data_parity_verified: false,
          data_parity_note: DATA_PARITY_NOTE,
        }));
      }
      if (status === 'approved' && isNonEmptyString(fresh?.sos_order_id)) {
        return addDeprecationHeader(Response.json({
          ok: true,
          action: 'salesorder_cached',
          sos_order_id: fresh.sos_order_id,
          sos_order_number: fresh.sos_order_number || null,
          data_parity_verified: false,
          data_parity_note: DATA_PARITY_NOTE,
        }));
      }
      return err(409, 'in_progress',
        'Push already in progress for this Project; retry shortly');
    }

    const runs = await base44.asServiceRole.entities.TapeRun.filter({ project_id: projectId });
    const lineItems = buildLineItems(runs);
    const sosBody = buildSOSBody(project, customer, lineItems);

    // P1 fix from Codex audit of #43 (mirrors pushProjectToSOS): pre-POST
    // race-winner recheck to prevent duplicate external creates under
    // stale-lock recovery.
    const preFlightFresh = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
    if (status === 'submitted' && isNonEmptyString(preFlightFresh?.sos_estimate_id)) {
      await releasePushLock(base44, projectId);
      return addDeprecationHeader(Response.json({
        ok: true,
        action: 'estimate_cached',
        sos_estimate_id: preFlightFresh.sos_estimate_id,
        sos_estimate_number: preFlightFresh.sos_estimate_number || null,
        data_parity_verified: false,
        data_parity_note: DATA_PARITY_NOTE,
      }));
    }
    if (status === 'approved' && isNonEmptyString(preFlightFresh?.sos_order_id)) {
      await releasePushLock(base44, projectId);
      return addDeprecationHeader(Response.json({
        ok: true,
        action: 'salesorder_cached',
        sos_order_id: preFlightFresh.sos_order_id,
        sos_order_number: preFlightFresh.sos_order_number || null,
        data_parity_verified: false,
        data_parity_note: DATA_PARITY_NOTE,
      }));
    }

    const endpoint = status === 'submitted' ? '/estimate' : '/salesorder';
    const res = await callSOS(base44, config, 'POST', endpoint, sosBody);

    const envelopeStatus = res.bodyJson?.status;
    if (
      res.status !== 200
      || !res.bodyJson
      || envelopeStatus === 'error'
      || envelopeStatus === 'invalid'
      || envelopeStatus === 'failed'
    ) {
      throw new Error(sanitizeSOSError(
        `SOS ${endpoint} push failed`,
        res.status,
      ));
    }

    const obj = res.bodyJson.data ?? res.bodyJson;
    const sosId = obj?.id != null ? String(obj.id) : null;
    if (!sosId) {
      throw new Error(`SOS ${endpoint} response missing id`);
    }
    const sosNumber = obj?.number ? String(obj.number) : null;

    // last_sos_sync_at uses nowIso (admin-visibility only; not used for
    // content-parity comparison — see DATA_PARITY_NOTE).
    if (status === 'submitted') {
      const patch = {
        sos_estimate_id: sosId,
        sos_estimate_status_at_push: String(obj?.status || obj?.statusDescription || ''),
        last_sos_sync_at: nowIso,
        last_sos_sync_error: '',
      };
      if (sosNumber) patch.sos_estimate_number = sosNumber;
      await releasePushLock(base44, projectId, patch);
      return addDeprecationHeader(Response.json({
        ok: true,
        action: 'estimate_created',
        sos_estimate_id: sosId,
        sos_estimate_number: sosNumber,
      }));
    }

    const patch = {
      sos_order_id: sosId,
      last_sos_sync_at: nowIso,
      last_sos_sync_error: '',
    };
    if (sosNumber) patch.sos_order_number = sosNumber;
    await releasePushLock(base44, projectId, patch);
    return addDeprecationHeader(Response.json({
      ok: true,
      action: 'salesorder_created',
      sos_order_id: sosId,
      sos_order_number: sosNumber,
    }));
  } catch (error) {
    if (projectId && base44 && lockAcquired) {
      try {
        const msg = String(error?.message || 'Unknown push error').slice(0, 500);
        await releasePushLock(base44, projectId, {
          last_sos_sync_error: msg,
        });
      } catch { /* secondary failure; surfaced via outer return */ }
    }
    return err(500, 'internal', 'Internal error during project push');
  }
});
