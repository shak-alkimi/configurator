import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';
import {
    TAPE_SPECS,
    CHANNEL_SPECS,
    DRIVER_SPECS,
    DEFAULT_DRIVER_MAX_WATTS,
    DRIVER_LOAD_FACTOR,
    SPOOL_LENGTH_FEET,
    CLIPS_PER_SECTION,
    CLIPS_PER_SET,
    CLIP_SET_PRICE,
    SHIPPING_RATE,
} from '../../shared/pricing.js';

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

        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, undefined, undefined, undefined, data_env);
        
        if (!projects || projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        
        // The SDK sometimes wraps entity payloads under `.data`, sometimes returns
        // flat objects depending on the API path used. Normalize once so all
        // subsequent reads work regardless of shape.
        const projectRaw = projects[0];
        const project = projectRaw.data || projectRaw;
        const tapeRuns = await base44.asServiceRole.entities.TapeRun.filter({ project_id }, undefined, undefined, undefined, data_env);

        const doc = new jsPDF();

        // Header
        doc.setFontSize(20);
        doc.text('ALKIMI', 20, 20);
        
        // Project Information
        let y = 35;
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Project Information', 20, y);
        y += 8;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Project Name: ${project.project_name || ''}`, 20, y);
        y += 6;
        // Treat legacy '—' placeholder as blank (older drafts seeded the dash).
        const customerName = (project.customer_name && project.customer_name !== '—') ? project.customer_name : '';
        doc.text(`Customer: ${customerName}`, 20, y);
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
        doc.text('Length', 48, y);
        doc.text('Output', 73, y);
        doc.text('CCT', 103, y);
        doc.text('Housing', 128, y);
        doc.text('Driver Group', 158, y);
        doc.text('Cost', 193, y);
        y += 7;

        doc.setFont(undefined, 'normal');
        tapeRuns.forEach((run) => {
            const runData = run.data || run;
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            // Round total-inches first so 5.99ft → 6'0", not 5'12"
            const totalIn = Math.round((runData.length_feet || 0) * 12);
            const feet = Math.floor(totalIn / 12);
            const inches = totalIn % 12;
            const lengthDisplay = `${feet}' ${inches}"`;
            
            const tapeSpec = TAPE_SPECS[runData.tape_output];
            const channelSpec = CHANNEL_SPECS[runData.channel_type];
            const outputDisplay = runData.tape_output || '';
            
            // Calculate cost with rounded channel sections
            let cost = 0;
            if (tapeSpec) cost += runData.length_feet * tapeSpec.price_per_foot;
            if (channelSpec && runData.channel_type !== 'none') {
                const sections = Math.ceil(runData.length_feet / 4);
                const actualFeet = sections * 4;
                cost += actualFeet * channelSpec.price_per_foot;
            }
            
            const channelDisplay = (runData.channel_type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            doc.text(runData.run_name || '', 20, y);
            doc.text(lengthDisplay, 48, y);
            doc.text(outputDisplay, 73, y);
            doc.text(runData.cct || '', 103, y);
            doc.text(channelDisplay, 128, y);
            doc.text(runData.driver_group || '', 158, y);
            doc.text(`$${cost.toFixed(2)}`, 193, y);
            y += 7;
        });

        y += 5;
        doc.setFont(undefined, 'bold');
        const totalFeet = tapeRuns.reduce((sum, r) => {
            const runData = r.data || r;
            return sum + runData.length_feet;
        }, 0);
        const totalFeetTotalIn = Math.round((totalFeet || 0) * 12);
        const totalFeetDisplay = `${Math.floor(totalFeetTotalIn / 12)}' ${totalFeetTotalIn % 12}"`;
        doc.text(`Total Length: ${totalFeetDisplay}`, 20, y);
        y += 10;

        // Materials & Pricing Summary
        doc.setFontSize(14);
        doc.text('Materials & Pricing', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        // Calculate materials
        const totalTapeFeet = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            return sum + runData.length_feet;
        }, 0);
        const totalTapeCost = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            const spec = TAPE_SPECS[runData.tape_output];
            return sum + (spec ? runData.length_feet * spec.price_per_foot : 0);
        }, 0);
        
        // Calculate channel cost with rounded 4' sections
        const totalChannelCost = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            const spec = CHANNEL_SPECS[runData.channel_type];
            if (spec && runData.channel_type !== 'none') {
                const sections = Math.ceil(runData.length_feet / 4);
                const actualFeet = sections * 4;
                return sum + actualFeet * spec.price_per_foot;
            }
            return sum;
        }, 0);

        const totalWattage = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            const spec = TAPE_SPECS[runData.tape_output];
            return sum + (spec ? runData.length_feet * spec.watts_per_foot : 0);
        }, 0);

        // Price the actual configured drivers. Fall back to watts-derived default-driver
        // count only if the project has no driver list.
        const projectDrivers = (project.drivers || []);
        let driversNeeded;
        let driverCost;
        let driverLineLabel;
        if (projectDrivers.length > 0) {
            driversNeeded = projectDrivers.length;
            driverCost = projectDrivers.reduce((sum, d) => {
                const spec = DRIVER_SPECS[d.maxWatts];
                return sum + (spec ? spec.price : 0);
            }, 0);
            driverLineLabel = `Drivers (${projectDrivers.map(d => `${d.maxWatts}W`).join('+')})`;
        } else {
            const defaultSpec = DRIVER_SPECS[DEFAULT_DRIVER_MAX_WATTS];
            driversNeeded = Math.ceil(totalWattage / (defaultSpec.max_watts * DRIVER_LOAD_FACTOR));
            driverCost = driversNeeded * defaultSpec.price;
            driverLineLabel = `Drivers (${driversNeeded}x ${defaultSpec.max_watts}W)`;
        }
        
        // Calculate clips
        const totalSections = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            if (runData.channel_type !== 'none') {
                return sum + Math.ceil(runData.length_feet / 4);
            }
            return sum;
        }, 0);
        const totalClips = totalSections * CLIPS_PER_SECTION;
        const clipSets = Math.ceil(totalClips / CLIPS_PER_SET);
        const clipCost = clipSets * CLIP_SET_PRICE;
        
        const subtotal = totalTapeCost + totalChannelCost + driverCost + clipCost;
        const shipping = subtotal * SHIPPING_RATE;
        const total = subtotal + shipping;

        doc.text(`Tape Light (${totalTapeFeet.toFixed(1)} ft): $${totalTapeCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Channel Housing: $${totalChannelCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`${driverLineLabel}: $${driverCost.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Mounting Hardware (${clipSets} sets): $${clipCost.toFixed(2)}`, 20, y);
        y += 6;
        // Connectors are counted on the on-screen Materials panel; mirror them
        // here so the customer-facing quote isn't missing line items.
        const tapeToTapeConnectors = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            const spools = Math.ceil((runData.length_feet || 0) / SPOOL_LENGTH_FEET);
            return sum + Math.max(0, spools - 1);
        }, 0);
        const tapeToWireConnectors = tapeRuns.length;
        doc.text(`Tape-to-Tape Connectors: ${tapeToTapeConnectors} units`, 20, y);
        y += 6;
        doc.text(`Tape-to-Wire Connectors: ${tapeToWireConnectors} units`, 20, y);
        y += 6;
        doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 20, y);
        y += 6;
        doc.text(`Shipping (${(SHIPPING_RATE * 100).toFixed(0)}%): $${shipping.toFixed(2)}`, 20, y);
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