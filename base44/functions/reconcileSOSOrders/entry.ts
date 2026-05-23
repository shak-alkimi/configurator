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
  await base44.asServiceRole.entities.IntegrationConfig.update(config.id, {
    access_token: newToken,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    ...(json.expires_in ? { token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString() } : {}),
  });
  return newToken;
}

// Maps a SOS sales order payload to Base44 Project fields that may have changed.
// Returns an object of only the fields that differ from the current project.
async function syncProjectFromSOS(base44, project, getToken, onUnauthorized, data_env) {
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

  const updates = {};
  const mappedStatus = mapToProjectStatus(order, project.status);
  if (mappedStatus && mappedStatus !== project.status) {
    updates.status = mappedStatus;
  }
  if (order?.trackingnumber && order.trackingnumber !== project.tracking_number) {
    updates.tracking_number = order.trackingnumber;
  }
  updates.last_sos_sync_at = new Date().toISOString();
  updates.last_sos_sync_error = null;

  if (Object.keys(updates).length > 0) {
    await base44.asServiceRole.entities.Project.update(project.id, updates, data_env);
  }

  // Return only the business-logic deltas (not the housekeeping fields)
  const { last_sos_sync_at, last_sos_sync_error, ...businessUpdates } = updates;
  return businessUpdates;
}

// ── Main handler ─────────────────────────────────────────────────────────────

async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await safeJson(req);
    const data_env = payload?.data_env;

    const config = await loadSOSConfig(base44);
    if (!config) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }

    const projects = await base44.asServiceRole.entities.Project.filter(
      {}, undefined, undefined, undefined, data_env
    );
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
        const updates = await syncProjectFromSOS(base44, project, getToken, onUnauthorized, data_env);
        if (Object.keys(updates).length > 0) results.updated++;
      } catch (error) {
        results.errors.push({ id: project.id, message: error.message });
        await base44.asServiceRole.entities.Project.update(
          project.id,
          { last_sos_sync_at: new Date().toISOString(), last_sos_sync_error: error.message },
          data_env
        ).catch(() => {}); // swallow secondary failure
      }
    }

    return Response.json(results);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});