import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function sanitizeToken(raw) {
  return (raw || '').replace(/[\s\u0000-\u001F\u007F]/g, '');
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // AUTH + OWNERSHIP (task #12 — Codex P0 from comprehensive audit 2026-05-24).
    // Previously this function had no auth check, so any caller knowing/guessing
    // a project_id could create a SOS sales order from another rep's project
    // data. Require login + project ownership (or admin) before any service-role
    // read or upstream POST.
    const user = await base44.auth.me();
    if (!user || !user.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    // Support both automation payload (event.entity_id) and direct invocation ({ project_id })
    const project_id = payload.event?.entity_id || payload.project_id;
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Fetch the project FIRST (before any IntegrationConfig touch) so we can
    // gate on ownership before exposing any side effects.
    const project = await base44.asServiceRole.entities.Project.get(project_id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    const isAdmin = user.role === 'admin';
    const isOwner = project.created_by && project.created_by === user.email;
    if (!isAdmin && !isOwner) {
      return Response.json({ error: 'Not authorized for this project' }, { status: 403 });
    }

    // Fetch SOS credentials from IntegrationConfig
    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
    if (!configs || configs.length === 0) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }
    const config = configs[0];
    if (!config.access_token) {
      return Response.json({ error: 'SOS access token not configured' }, { status: 400 });
    }
    let accessToken = sanitizeToken(config.access_token);

    // Fetch tape runs for this project
    const runs = await base44.asServiceRole.entities.TapeRun.filter({ project_id });

    // Build line items from tape runs
    const lineItems = runs.map((run, i) => ({
      linenumber: i + 1,
      name: [run.run_name, run.location, run.cct, run.tape_output, run.channel_type]
        .filter(Boolean).join(' — '),
      quantity: run.length_feet || 1,
      unit: 'ft',
      description: [
        run.product_type,
        run.lens ? `Lens: ${run.lens}` : null,
        run.finish ? `Finish: ${run.finish}` : null,
        run.notes || null
      ].filter(Boolean).join(', ')
    }));

    const salesOrder = {
      customer: { name: project.customer_name || project.project_name },
      date: new Date().toISOString().split('T')[0],
      ponumber: project.quote_number || '',
      description: project.project_name,
      lines: lineItems
    };

    const postOrder = (token) => fetch('https://api.sosinventory.com/api/v2/salesorder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(salesOrder)
    });

    let response = await postOrder(accessToken);
    if (response.status === 401) {
      accessToken = await refreshAccessToken(base44, config);
      response = await postOrder(accessToken);
    }

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ error: 'SOS API error', details: data }, { status: response.status });
    }

    return Response.json({ success: true, salesOrder: data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});