import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Foreground refresh: called from the rep portal when a project page mounts.
// Fetches current SOS state for one project, applies any deltas, and returns
// the updated project. Gives near-real-time updates when the rep is actively
// looking, complementing the background reconcile sweep.

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';

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
  // #114: also reject envelope-level errors even on HTTP 200 — SOS can
  // return 200 with { status: 'error' | 'invalid' | 'failed' } and a null
  // data payload. Without this check we'd silently no-op the status sync.
  // Spike-validated set from #42.
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
    await base44.asServiceRole.entities.Project.update(project.id, deltas, data_env);
  }

  return deltas;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, data_env } = await req.json();
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Use the user's own RLS-scoped view so we don't leak projects across reps.
    const project = await base44.entities.Project.get(project_id, data_env);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!project.sos_order_id) {
      // Project hasn't been pushed to SOS yet — nothing to refresh.
      return Response.json({ project, updates: {} });
    }

    const config = await loadSOSConfig(base44);
    if (!config) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }

    let token = sanitizeToken(config.access_token);
    const getToken = () => token;
    const onUnauthorized = async () => { token = await refreshAccessToken(base44, config); };

    try {
      const updates = await syncProjectFromSOS(base44, project, getToken, onUnauthorized, data_env);
      const refreshed = Object.keys(updates).length > 0
        ? await base44.entities.Project.get(project_id, data_env)
        : project;
      return Response.json({ project: refreshed, updates });
    } catch (error) {
      await base44.asServiceRole.entities.Project.update(
        project.id,
        { last_sos_sync_at: new Date().toISOString(), last_sos_sync_error: error.message },
        data_env
      ).catch(() => {});
      return Response.json({ error: error.message }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});