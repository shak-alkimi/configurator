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

        const project = await base44.asServiceRole.entities.Project.get(project_id, data_env);

        if (!project) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const tapeRuns = await base44.asServiceRole.entities.TapeRun.filter({ project_id }, undefined, undefined, undefined, data_env);

        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text('ALKILINE', 20, 20);
        
        // Project Information
        let y = 35;
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Project Information', 20, y);
        y += 8;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Project Name: ${project.project_name}`, 20, y);
        y += 6;
        doc.text(`Customer: ${project.customer_name}`, 20, y);
        y += 6;
        if (project.customer_email) {
            doc.text(`Email: ${project.customer_email}`, 20, y);
            y += 6;
        }
        if (project.customer_phone) {
            doc.text(`Phone: ${project.customer_phone}`, 20, y);
            y += 6;
        }
        if (project.street || project.city || project.state) {
            const address = [project.street, project.city, project.state].filter(Boolean).join(', ');
            doc.text(`Address: ${address}`, 20, y);
            y += 6;
        }
        if (project.sector) {
            doc.text(`Sector: ${project.sector}`, 20, y);
            y += 6;
        }
        doc.text(`Status: ${project.status}`, 20, y);
        y += 10;

        // Configured Runs
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Configured Runs', 20, y);
        y += 8;
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
        doc.text(`Total Length: ${totalFeetDisplay}`, 20, y);
        y += 10;

        // Materials & Pricing Summary
        doc.setFontSize(14);
        doc.text('Materials & Pricing', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        // Calculate materials
        const totalTapeFeet = tapeRuns.reduce((sum, run) => sum + run.length_feet, 0);
        const totalTapeCost = tapeRuns.reduce((sum, run) => {
            const spec = TAPE_SPECS[run.tape_type];
            return sum + (spec ? run.length_feet * spec.price_per_foot : 0);
        }, 0);
        
        const totalChannelCost = tapeRuns.reduce((sum, run) => {
            const spec = CHANNEL_SPECS[run.channel_type];
            return sum + (spec ? run.length_feet * spec.price_per_foot : 0);
        }, 0);

        const totalWattage = tapeRuns.reduce((sum, run) => {
            const spec = TAPE_SPECS[run.tape_type];
            return sum + (spec ? run.length_feet * spec.watts_per_foot : 0);
        }, 0);

        const driversNeeded = Math.ceil(totalWattage / 60);
        const driverCost = driversNeeded * 85;
        const hardwareCost = 15;
        const subtotal = totalTapeCost + totalChannelCost + driverCost + hardwareCost;
        const shipping = subtotal * 0.05;
        const total = subtotal + shipping;

        doc.text(`Tape Light (${totalTapeFeet.toFixed(1)} ft): $${totalTapeCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Channel Housing: $${totalChannelCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Drivers (${driversNeeded}x 60W): $${driverCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Hardware & Connectors: $${hardwareCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Shipping (5%): $${shipping.toFixed(2)}`, 20, y);
        y += 8;
        doc.setFont(undefined, 'bold');
        doc.text(`Total: $${total.toFixed(2)}`, 20, y);

        if (project.notes) {
            y += 10;
            doc.setFont(undefined, 'bold');
            doc.text('Notes:', 20, y);
            y += 6;
            doc.setFont(undefined, 'normal');
            const splitNotes = doc.splitTextToSize(project.notes, 170);
            doc.text(splitNotes, 20, y);
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