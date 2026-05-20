import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    // Support both automation payload (event.entity_id) and direct invocation ({ project_id })
    const project_id = payload.event?.entity_id || payload.project_id;

    // Fetch SOS credentials from IntegrationConfig
    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
    if (!configs || configs.length === 0) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }
    const config = configs[0];
    const accessToken = config.access_token;
    if (!accessToken) {
      return Response.json({ error: 'SOS access token not configured' }, { status: 400 });
    }

    // Fetch the project
    const project = await base44.asServiceRole.entities.Project.get(project_id);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

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

    const response = await fetch('https://api.sosinventory.com/api/v2/salesorder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(salesOrder)
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json({ error: 'SOS API error', details: data }, { status: response.status });
    }

    return Response.json({ success: true, salesOrder: data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});