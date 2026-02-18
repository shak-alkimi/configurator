import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project_id, data_env } = await req.json();

        if (!project_id) {
            return Response.json({ error: 'Project ID required' }, { status: 400 });
        }

        const env = data_env || 'prod';

        // Fetch project and tape runs
        const project = await base44.entities.Project.get(project_id, env);

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const tapeRuns = await base44.entities.TapeRun.filter({ project_id }, undefined, undefined, undefined, env);

        // Create CSV
        let csv = 'Project Information\n';
        csv += `Project Name,${project.project_name}\n`;
        csv += `Customer,${project.customer_name}\n`;
        csv += `Email,${project.customer_email || ''}\n`;
        csv += `Phone,${project.customer_phone || ''}\n`;
        csv += `Status,${project.status}\n`;
        csv += `Total Price,$${project.total_price ? project.total_price.toFixed(2) : '0.00'}\n\n`;

        csv += 'Tape Runs\n';
        csv += 'Run Name,Length (ft),Tape Type,Housing Type,Notes\n';
        
        tapeRuns.forEach(run => {
            csv += `"${run.run_name || ''}",${run.length_feet.toFixed(2)},${run.tape_type},${run.channel_type},"${run.notes || ''}"\n`;
        });

        return new Response(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${project.project_name}.csv"`
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});