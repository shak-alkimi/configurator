import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// probePushEstimate — temporary diagnostic for the #43 estimate-push 400.
// Calls SOS POST /estimate with the same body shape pushProjectToSOS would
// build, returns the raw response body so we can see why SOS is rejecting.
// DELETE after diagnosis.

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}
function sanitizeToken(raw) {
  return String(raw || '').replace(/[\s\x00-\x1F\x7F]/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return err(403, 'forbidden', 'admin only');

    const body = await req.json().catch(() => ({}));
    const projectId = body?.project_id;
    if (!projectId) return err(400, 'bad_request', 'project_id required');

    const project = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
    if (!project) return err(404, 'not_found', 'project not found');
    const customer = await base44.asServiceRole.entities.Customer.get(project.opus_customer_id).catch(() => null);
    if (!customer) return err(404, 'not_found', 'customer not found');
    const runs = await base44.asServiceRole.entities.TapeRun.filter({ project_id: projectId });

    const lineItems = runs.map((run, i) => ({
      linenumber: i + 1,
      name: [run.run_name, run.location, run.cct, run.tape_output, run.channel_type].filter(Boolean).join(' — '),
      quantity: run.length_feet || 1,
      unit: 'ft',
      description: [run.product_type, run.lens ? `Lens: ${run.lens}` : null, run.finish ? `Finish: ${run.finish}` : null, run.notes || null].filter(Boolean).join(', '),
    }));

    const sosBody = {
      customer: {
        id: Number(customer.sos_id),
        ...(customer.name ? { name: customer.name } : {}),
      },
      date: new Date().toISOString().split('T')[0],
      ponumber: project.quote_number || '',
      description: project.project_name || '',
      lines: lineItems,
    };

    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
    const config = configs?.[0];
    const token = sanitizeToken(config?.access_token);

    const res = await fetch(`${SOS_API_BASE}/estimate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sosBody),
    });
    const responseText = await res.text();

    return Response.json({
      ok: true,
      sos_request_body: sosBody,
      sos_http_status: res.status,
      sos_response_body_text: responseText.slice(0, 1500),
    });
  } catch (error) {
    return err(500, 'internal', error?.message || 'unknown');
  }
});
