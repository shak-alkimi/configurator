import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

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

        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.text('ALKILINE - Configured Runs', 20, 20);

        let y = 40;
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('Type', 20, y);
        doc.text('Length', 50, y);
        doc.text('Output', 80, y);
        doc.text('CCT', 115, y);
        doc.text('Housing', 145, y);
        doc.text('Cost', 180, y);
        y += 7;

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

        doc.setFont(undefined, 'normal');
        tapeRuns.forEach((run) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            const feet = Math.floor(run.length_feet);
            const inches = Math.round((run.length_feet % 1) * 12);
            const lengthDisplay = `${feet}' ${inches}"`;
            
            const tapeSpec = TAPE_SPECS[run.tape_type];
            const channelSpec = CHANNEL_SPECS[run.channel_type];
            const outputDisplay = tapeSpec ? `${tapeSpec.watts_per_foot}w/ft` : run.tape_type;
            
            let cost = 0;
            if (tapeSpec) cost += run.length_feet * tapeSpec.price_per_foot;
            if (channelSpec) cost += run.length_feet * channelSpec.price_per_foot;
            
            const channelDisplay = run.channel_type === 'recessed' ? 'Recessed Flange' : 
                                   run.channel_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            doc.text(run.run_name || '', 20, y);
            doc.text(lengthDisplay, 50, y);
            doc.text(outputDisplay, 80, y);
            doc.text(run.cct || '', 115, y);
            doc.text(channelDisplay, 145, y);
            doc.text(`$${cost.toFixed(2)}`, 180, y);
            y += 7;
        });

        y += 5;
        doc.setFont(undefined, 'bold');
        const totalFeet = tapeRuns.reduce((sum, r) => sum + r.length_feet, 0);
        const totalFeetDisplay = `${Math.floor(totalFeet)}' ${Math.round((totalFeet % 1) * 12)}"`;
        doc.text(`Total: ${totalFeetDisplay}`, 20, y);

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${project.project_name}.pdf"`
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});