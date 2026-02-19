import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

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
        const [project] = await base44.entities.Project.filter({ id: project_id }, undefined, undefined, undefined, env);

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const tapeRuns = await base44.entities.TapeRun.filter({ project_id }, undefined, undefined, undefined, env);

        // Create PDF
        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text('Project Quote', 20, 20);

        // Project Details
        doc.setFontSize(12);
        doc.text(`Project: ${project.project_name}`, 20, 35);
        doc.text(`Customer: ${project.customer_name}`, 20, 42);
        if (project.customer_email) doc.text(`Email: ${project.customer_email}`, 20, 49);
        if (project.customer_phone) doc.text(`Phone: ${project.customer_phone}`, 20, 56);
        doc.text(`Status: ${project.status}`, 20, 63);

        // Tape Runs
        let y = 80;
        doc.setFontSize(14);
        doc.text('Tape Runs', 20, y);
        y += 10;

        doc.setFontSize(10);
        tapeRuns.forEach((run, index) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            const feet = Math.floor(run.length_feet);
            const inches = Math.round((run.length_feet % 1) * 12);
            doc.text(`${index + 1}. ${run.run_name || 'Run'} - ${feet}' ${inches}"`, 25, y);
            doc.text(`Type: ${run.tape_type}, Housing: ${run.channel_type}`, 30, y + 5);
            y += 12;
        });

        // Total
        if (project.total_price) {
            y += 10;
            doc.setFontSize(14);
            doc.text(`Total: $${project.total_price.toFixed(2)}`, 20, y);
        }

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