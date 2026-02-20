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

        const projects = await base44.asServiceRole.entities.Project.list(undefined, undefined, undefined, undefined, data_env);
        const project = projects.find(p => p.id === project_id);

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const tapeRuns = await base44.asServiceRole.entities.TapeRun.filter({ project_id }, undefined, undefined, undefined, data_env);

        const TAPE_SPECS = {
            "2w": { price_per_foot: 10, watts_per_foot: 2.0, lumens_per_foot: 200 },
            "4w": { price_per_foot: 12, watts_per_foot: 4.0, lumens_per_foot: 400 }
        };
        
        const CHANNEL_SPECS = {
            corner: { price_per_foot: 10 },
            recessed: { price_per_foot: 12 },
            surface: { price_per_foot: 8 },
            none: { price_per_foot: 0 }
        };
        
        let csv = 'Type,Length (ft),Length (ft\'in"),Output,CCT,Housing,Cost\n';
        
        tapeRuns.forEach(run => {
            const feet = Math.floor(run.length_feet);
            const inches = Math.round((run.length_feet % 1) * 12);
            const lengthDisplay = `${feet}' ${inches}"`;
            
            const tapeSpec = TAPE_SPECS[run.tape_type];
            const channelSpec = CHANNEL_SPECS[run.channel_type];
            const outputDisplay = tapeSpec ? `${tapeSpec.watts_per_foot}w/ft (${tapeSpec.lumens_per_foot}lm/ft)` : run.tape_type;
            
            let cost = 0;
            if (tapeSpec) cost += run.length_feet * tapeSpec.price_per_foot;
            if (channelSpec) cost += run.length_feet * channelSpec.price_per_foot;
            
            const channelDisplay = run.channel_type === 'recessed' ? 'Recessed Flange' : 
                                   run.channel_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            csv += `"${run.run_name || ''}",${run.length_feet.toFixed(2)},"${lengthDisplay}","${outputDisplay}","${run.cct || ''}","${channelDisplay}",$${cost.toFixed(2)}\n`;
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