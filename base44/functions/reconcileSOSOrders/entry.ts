import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadSOSConfig, refreshAccessToken, syncProjectFromSOS } from '../../shared/sos.js';

// Scheduled reconciliation: pulls SOS status for active projects and writes
// any deltas back to Base44. Runs on the per-status cadence configured in
// the Base44 builder (typically 5–10 min for in_fulfillment / submitted,
// 30+ min for approved). Idempotent — no DB write if nothing changed.
//
// SOS has no outgoing webhooks, so polling is the only mechanism for
// approval status and tracking number propagation.

const ACTIVE_STATUSES = ['submitted', 'approved', 'in_fulfillment'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await safeJson(req);
    const data_env = payload?.data_env;

    const config = await loadSOSConfig(base44, data_env);
    if (!config) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }

    const projects = await base44.asServiceRole.entities.Project.filter(
      {}, undefined, undefined, undefined, data_env
    );
    const active = (projects || []).filter(p =>
      ACTIVE_STATUSES.includes(p.status) && p.sos_order_id
    );

    let token = config.access_token;
    const getToken = () => token;
    const onUnauthorized = async () => { token = await refreshAccessToken(base44, config, data_env); };

    const results = { polled: 0, updated: 0, errors: [] as { id: string; message: string }[] };

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

async function safeJson(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
