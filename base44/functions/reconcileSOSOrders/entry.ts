import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled reconciliation: pulls SOS status for active projects and writes
// any deltas back to Base44. Runs on the per-status cadence configured in
// the Base44 builder (typically 5–10 min for in_fulfillment / submitted,
// 30+ min for approved). Idempotent — no DB write if nothing changed.
//
// SOS has no outgoing webhooks, so polling is the only mechanism for
// approval status and tracking number propagation.

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
const ACTIVE_STATUSES = ['submitted', 'approved', 'in_fulfillment'];

// ── Inlined helpers (shared/sos.js no longer available in runtime) ──────────

function sanitizeToken(raw) {
  return (raw || '').replace(/[\s\u0000-\u001F\u007F]/g, '');
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
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh HTTP ${res.status}: ${body.slice(0, 200)}`);
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

// Maps a SOS sales order payload to Base44 Project fields that may have changed.
// Returns an object of only the fields that differ from the current project.
async function syncProjectFromSOS(base44, project, getToken, onUnauthorized) {
  const fetchOrder = async () => fetch(`${SOS_API_BASE}/salesorder/${project.sos_order_id}`, {
    headers: { Authorization: `Bearer ${sanitizeToken(getToken())}` },
  });

  let res = await fetchOrder();
  if (res.status === 401) {
    await onUnauthorized();
    res = await fetchOrder();
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SOS GET salesorder ${project.sos_order_id} returned ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  // #114: also reject envelope-level errors even on HTTP 200 — SOS can
  // return 200 with { status: 'error' | 'invalid' | 'failed' } and a null
  // data payload. Without this check we'd treat the missing data as "no
  // deltas to apply" and silently no-op the reconcile. Spike-validated
  // set from #42.
  const envelopeStatus = json?.status;
  if (envelopeStatus === 'error' || envelopeStatus === 'invalid' || envelopeStatus === 'failed') {
    throw new Error(`SOS GET salesorder ${project.sos_order_id} rejected (status=${envelopeStatus})`);
  }
  const order = json?.data ?? json;

  // Map SOS order status to Base44 project status using fuzzy substring match
  // to handle variations like 'Open/Approved', 'Shipped/Closed', etc.
  const mapToProjectStatus = (sosOrder, currentStatus) => {
    const s = (sosOrder?.status || sosOrder?.statusDescription || '').toLowerCase();
    if (s.includes('shipped') || s.includes('closed')) return 'shipped';
    if (s.includes('approved') || s.includes('open')) {
      return currentStatus === 'shipped' ? currentStatus : 'approved';
    }
    return null;
  };

  const deltas = {};
  const mappedStatus = mapToProjectStatus(order, project.status);
  if (mappedStatus && mappedStatus !== project.status) {
    deltas.status = mappedStatus;
  }
  if (order?.trackingnumber && order.trackingnumber !== project.tracking_number) {
    deltas.tracking_number = order.trackingnumber;
  }

  if (Object.keys(deltas).length > 0) {
    await base44.asServiceRole.entities.Project.update(project.id, deltas);
  }

  return deltas;
}

// ── Main handler ─────────────────────────────────────────────────────────────

async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // AUTH (task #31 — Codex P0 from comprehensive audit 2026-05-24).
    // This is a service-role mass sync over every active project. Without an
    // auth check, any unauthenticated caller could force cross-environment
    // reconciliation, persist raw sync errors into last_sos_sync_error, and
    // burn through SOS rate limits. Require admin to invoke. The scheduler/
    // automation system fires this as a system context (admin role).
    const user = await base44.auth.me();
    if (!user || !user.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin role required' }, { status: 403 });
    }

    await safeJson(req); // consume body (data_env intentionally not read — #22)

    const config = await loadSOSConfig(base44);
    if (!config) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }

    const projects = await base44.asServiceRole.entities.Project.filter({});
    const active = (projects || []).filter(p =>
      ACTIVE_STATUSES.includes(p.status) && p.sos_order_id
    );

    let token = sanitizeToken(config.access_token);
    const getToken = () => token;
    const onUnauthorized = async () => { token = await refreshAccessToken(base44, config); };

    const results = { polled: 0, updated: 0, errors: [] };

    for (const project of active) {
      results.polled++;
      try {
        const updates = await syncProjectFromSOS(base44, project, getToken, onUnauthorized);
        if (Object.keys(updates).length > 0) results.updated++;
      } catch (error) {
        results.errors.push({ id: project.id, message: error.message });
        await base44.asServiceRole.entities.Project.update(
          project.id,
          { last_sos_sync_at: new Date().toISOString(), last_sos_sync_error: error.message },
        ).catch(() => {}); // swallow secondary failure
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});