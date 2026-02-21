import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Fetch project details
    const project = await base44.entities.Project.get(project_id, 'dev');

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch tape runs for this project
    const tapeRuns = await base44.entities.TapeRun.filter(
      { project_id: project_id },
      undefined,
      undefined,
      undefined,
      'dev'
    );

    // Sort by order
    const sortedRuns = tapeRuns.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    // Build CSV content
    let csv = 'PROJECT DETAILS\n';
    csv += 'Project Name,Customer Name,Customer Email,Customer Phone,Street,City,State,Sector,Status,Notes,Total Price\n';
    csv += `"${escapeCSV(project.project_name || '')}","${escapeCSV(project.customer_name || '')}","${escapeCSV(project.customer_email || '')}","${escapeCSV(project.customer_phone || '')}","${escapeCSV(project.street || '')}","${escapeCSV(project.city || '')}","${escapeCSV(project.state || '')}","${escapeCSV(project.sector || '')}","${escapeCSV(project.status || 'draft')}","${escapeCSV(project.notes || '')}",${project.total_price || 0}\n`;

    // Add tape runs section
    csv += '\n\nTAPE RUNS\n';
    csv += 'Run Name,Length (Feet),Output Type,CCT,Housing Type,Notes\n';

    sortedRuns.forEach(run => {
      csv += `"${escapeCSV(run.run_name || '')}",${run.length_feet},${escapeCSV(run.tape_type || '')},${escapeCSV(run.cct || '')},${escapeCSV(run.channel_type || '')},${escapeCSV(run.notes || '')}\n`;
    });

    // Return CSV as response
    return Response.json({ csv }, { status: 200 });
  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function escapeCSV(str) {
  if (typeof str !== 'string') return str;
  // Escape quotes and wrap in quotes if contains comma, newline, or quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function escapeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}