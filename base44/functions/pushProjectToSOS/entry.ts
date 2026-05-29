import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// pushProjectToSOS — task #43. Status-branched push of an Opus Project to SOS.
//
// Renamed from createSOSSalesOrder. A thin compatibility alias is preserved
// in base44/functions/createSOSSalesOrder/entry.ts. The two files MUST stay
// in lockstep — drift between them is a P1 audit finding per #43 brief.
// Until the alias is verified safe to remove (no Builder Automations call
// the old endpoint, no production callers), any fix applied to one file
// must be applied identically to the other.
//
// CONTRACT:
//   POST { project_id: string }
//        OR { event: { entity_id: string } }   (Base44 Automation payload)
//
//   Response (admin OR project-owner):
//     200 { ok: true, action: 'estimate_created' | 'estimate_cached' |
//           'salesorder_created' | 'salesorder_cached' | 'terminal',
//           sos_estimate_id?, sos_estimate_number?, sos_order_id?,
//           sos_order_number?, project_status? }
//     400 not_submittable | bad_request | customer_not_linked |
//         customer_dangling | customer_not_in_sos | integration_not_configured
//     401 unauthorized
//     403 forbidden
//     404 not_found
//     409 in_progress
//     500 internal (generic; never echoes raw secrets)
//     502 upstream SOS errors are surfaced via sync_error + internal 500
//     503 disabled (PUSH_ENABLED constant set false)
//
// STATUS BRANCHING (Project.status):
//   draft           → 400 not_submittable. UI must transition first.
//   submitted       → POST /estimate (if sos_estimate_id empty; else cached)
//   approved        → POST /salesorder (if sos_order_id empty; else cached)
//   in_fulfillment  → no-op terminal (SOS-driven via reconcileSOSOrders)
//   shipped         → no-op terminal
//
// IDEMPOTENCY:
//   - Pre-check sos_estimate_id / sos_order_id before any SOS POST.
//   - Atomic CAS lock via Project.sos_push_in_progress / sos_push_in_progress_at
//     (5-min stale-lock recovery). Pattern mirrors #40 / #42.
//   - SOS provides NO idempotency per Spike C — entirely Opus-side enforcement.
//
// LINKAGE REQUIREMENTS:
//   - Project.opus_customer_id non-empty (deterministic FK from #115).
//   - Customer.sos_id non-empty (Customer must be pushed via #40
//     upsertSOSCustomer beforehand). No name/email matching anywhere.
//
// SCOPE NOTES:
//   - Estimate close on conversion (PUT /estimate/<id> with status:'Closed')
//     is DEFERRED. SOS-side estimate stays Pending after the project moves to
//     approved; admin can close manually in SOS UI. Requires a separate
//     spike to verify close-endpoint semantics.
//   - data_env propagation (#14) DEFERRED. Hardcoded prod SOS_API_BASE.
//     TODO #14: derive data_env server-side when staging/dev environments exist.

const PUSH_ENABLED = true;  // Edit + republish to halt all pushes globally.

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000;

// Status branching rules.
const PUSHABLE_STATUSES = new Set(['submitted', 'approved', 'in_fulfillment', 'shipped']);
const TERMINAL_STATUSES = new Set(['in_fulfillment', 'shipped']);

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// ── Token + SOS API helpers ────────────────────────────────────────────────

function sanitizeToken(raw) {
  // Keep the literal form per memory:alkimi-base44-sync (#40 / #112 — Builder
  // re-normalizes new RegExp string form back to literal on redeploy).
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
  // SOS throttle quirk per Spike A: 200 + body.message === 'Throttle limit exceeded'.
  if (response.status === 200 && parsedBody?.message === 'Throttle limit exceeded') {
    return { status: 429, bodyText, bodyJson: parsedBody };
  }
  return { status: response.status, bodyText, bodyJson: parsedBody };
}

// ── Line-item construction (preserves shape from createSOSSalesOrder) ──────

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

// SOS Estimate + SalesOrder share the same POST body shape per Spike findings.
// Customer reference uses sos_id (deterministic) + name (informational). No
// createCustomerIfNotFound — caller must have run upsertSOSCustomer first.
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

// ── Main handler ────────────────────────────────────────────────────────────

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

    // 1. Auth.
    const user = await base44.auth.me();
    if (!user || !user.email) {
      return err(401, 'unauthorized', 'Unauthorized');
    }

    // 2. Parse input. Accept both direct ({project_id}) and Base44 Automation
    // ({event: {entity_id}}) payloads (preserves createSOSSalesOrder contract).
    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    projectId = body?.event?.entity_id || body?.project_id;
    if (!isNonEmptyString(projectId)) {
      return err(400, 'bad_request', 'project_id required');
    }

    // 3. Load Project + ownership check. Service role bypasses RLS for the
    // read; explicit ownership verification gates the side effect (per #12).
    const project = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
    if (!project) {
      return err(404, 'not_found', `Project ${projectId} not found`);
    }
    const isAdmin = user.role === 'admin';
    const isOwner = project.created_by && project.created_by === user.email;
    if (!isAdmin && !isOwner) {
      return err(403, 'forbidden', 'Not authorized for this project');
    }

    // 4. Status branching: reject draft + unknown; early-return for terminal.
    const status = project.status || 'draft';
    if (status === 'draft' || !PUSHABLE_STATUSES.has(status)) {
      return err(400, 'not_submittable',
        `Project status '${status}' is not pushable. Submit the project first via the Configurator.`);
    }
    if (TERMINAL_STATUSES.has(status)) {
      return Response.json({
        ok: true,
        action: 'terminal',
        project_status: status,
        sos_estimate_id: project.sos_estimate_id || null,
        sos_order_id: project.sos_order_id || null,
      });
    }

    // 5. Idempotency pre-check (fast path before lock acquisition).
    if (status === 'submitted' && isNonEmptyString(project.sos_estimate_id)) {
      return Response.json({
        ok: true,
        action: 'estimate_cached',
        sos_estimate_id: project.sos_estimate_id,
        sos_estimate_number: project.sos_estimate_number || null,
      });
    }
    if (status === 'approved' && isNonEmptyString(project.sos_order_id)) {
      return Response.json({
        ok: true,
        action: 'salesorder_cached',
        sos_order_id: project.sos_order_id,
        sos_order_number: project.sos_order_number || null,
      });
    }

    // 6. Deterministic linkage: Project.opus_customer_id must be non-empty.
    // (writeProjectAsOwner #116 already enforces this server-side for the
    // status transition to submitted/approved, but re-check defensively here
    // — never trust caller state.)
    if (!isNonEmptyString(project.opus_customer_id)) {
      return err(400, 'customer_not_linked',
        'Project has no Customer linkage (opus_customer_id is empty). ' +
        'Use the admin UI to link a Customer record first.');
    }

    // 7. Load Customer entity + verify it's been pushed to SOS.
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

    // 8. Load SOS config.
    const config = await loadSOSConfig(base44);
    if (!config || !config.access_token) {
      return err(400, 'integration_not_configured',
        'SOS IntegrationConfig missing or has no access_token');
    }

    // 9. Acquire push lock (atomic CAS via updateMany with $or stale-recovery).
    const nowIso = new Date().toISOString();
    lockAcquired = await acquirePushLock(base44, projectId, nowIso);
    if (!lockAcquired) {
      // Re-read project to distinguish "race winner already finished" (return
      // cached) from "another call still in flight" (409 in_progress).
      const fresh = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
      if (status === 'submitted' && isNonEmptyString(fresh?.sos_estimate_id)) {
        return Response.json({
          ok: true,
          action: 'estimate_cached',
          sos_estimate_id: fresh.sos_estimate_id,
          sos_estimate_number: fresh.sos_estimate_number || null,
        });
      }
      if (status === 'approved' && isNonEmptyString(fresh?.sos_order_id)) {
        return Response.json({
          ok: true,
          action: 'salesorder_cached',
          sos_order_id: fresh.sos_order_id,
          sos_order_number: fresh.sos_order_number || null,
        });
      }
      return err(409, 'in_progress',
        'Push already in progress for this Project; retry shortly');
    }

    // 10. Load TapeRuns + build line items.
    const runs = await base44.asServiceRole.entities.TapeRun.filter({ project_id: projectId });
    const lineItems = buildLineItems(runs);

    // 11. Build SOS POST body using the canonical Customer entity (not the
    // project's potentially-stale cache fields).
    const sosBody = buildSOSBody(project, customer, lineItems);

    // 12. Branch: POST /estimate or POST /salesorder.
    const endpoint = status === 'submitted' ? '/estimate' : '/salesorder';
    const res = await callSOS(base44, config, 'POST', endpoint, sosBody);

    // 13. Envelope check (#114 pattern — SOS can return HTTP 200 with
    // {status: 'error'|'invalid'|'failed'} masking a real rejection).
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

    // 14. Extract returned record id/number + persist on Project. Same
    // envelope-tolerance pattern as #40 (data may be at root OR wrapped).
    const obj = res.bodyJson.data ?? res.bodyJson;
    const sosId = obj?.id != null ? String(obj.id) : null;
    if (!sosId) {
      throw new Error(`SOS ${endpoint} response missing id`);
    }
    const sosNumber = obj?.number ? String(obj.number) : null;

    if (status === 'submitted') {
      const patch = {
        sos_estimate_id: sosId,
        sos_estimate_status_at_push: String(obj?.status || obj?.statusDescription || ''),
        last_sos_sync_at: nowIso,
        last_sos_sync_error: '',
      };
      if (sosNumber) patch.sos_estimate_number = sosNumber;
      await releasePushLock(base44, projectId, patch);
      return Response.json({
        ok: true,
        action: 'estimate_created',
        sos_estimate_id: sosId,
        sos_estimate_number: sosNumber,
      });
    }

    // status === 'approved'
    const patch = {
      sos_order_id: sosId,
      last_sos_sync_at: nowIso,
      last_sos_sync_error: '',
    };
    if (sosNumber) patch.sos_order_number = sosNumber;
    await releasePushLock(base44, projectId, patch);
    return Response.json({
      ok: true,
      action: 'salesorder_created',
      sos_order_id: sosId,
      sos_order_number: sosNumber,
    });
  } catch (error) {
    // Generic outer catch per #107. Release lock + persist sanitized error
    // so admins can see what failed via last_sos_sync_error.
    if (projectId && base44 && lockAcquired) {
      try {
        const msg = String(error?.message || 'Unknown push error').slice(0, 500);
        await releasePushLock(base44, projectId, {
          last_sos_sync_error: msg,
          // Deliberately NOT updating last_sos_sync_at — staleness alarms
          // should fire if a Project hasn't successfully synced in a while.
        });
      } catch { /* secondary failure; surfaced via outer return */ }
    }
    return err(500, 'internal', 'Internal error during project push');
  }
});
