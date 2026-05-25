import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
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

// Marker so we can confirm the deployed bundle has this revision.
const FN_VERSION = 'pdf-rewrite-v1';

Deno.serve(async (req) => {
    let phase = 'init';
    let probe: Record<string, unknown> = {};
    try {
        phase = 'parse-body';
        const body = await req.json();
        const project_id = body?.project_id;
        if (!project_id) {
            return Response.json({ error: 'Project ID required', fnVersion: FN_VERSION }, { status: 400 });
        }
        probe.project_id = project_id;

        phase = 'create-client';
        const base44 = createClientFromRequest(req);

        phase = 'auth-me';
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized', fnVersion: FN_VERSION }, { status: 401 });
        }
        probe.userEmail = user.email;

        // Prefer asServiceRole; fall back to asUser if not exposed in this SDK version.
        phase = 'pick-entity-handle';
        const projectHandle = base44.asServiceRole?.entities?.Project ?? base44.entities?.Project;
        const tapeRunHandle = base44.asServiceRole?.entities?.TapeRun ?? base44.entities?.TapeRun;
        probe.usedServiceRole = !!base44.asServiceRole?.entities?.Project;
        if (!projectHandle || !tapeRunHandle) {
            return Response.json({ error: 'Entity handles unavailable', fnVersion: FN_VERSION, phase, probe }, { status: 500 });
        }

        phase = 'fetch-project';
        const projects = await projectHandle.filter({ id: project_id });
        probe.projectsLength = Array.isArray(projects) ? projects.length : -1;
        probe.projectsType = typeof projects;
        if (!projects || projects.length === 0) {
            return Response.json({ error: 'Project not found', fnVersion: FN_VERSION, probe }, { status: 404 });
        }

        phase = 'unwrap-project';
        const projectRaw = projects[0];

        // OWNERSHIP CHECK (task #20 — Codex P0 from comprehensive audit 2026-05-24).
        // Auth was already enforced above (line 35), but we were fetching the
        // project via service-role and exporting unconditionally. Any
        // authenticated user who knew/guessed a project_id could download
        // another rep's customer + project data as PDF. Enforce that the caller
        // is the owner OR an admin BEFORE rendering.
        {
          // Defend against Base44's optional wrapper shape (this function
          // unwraps projectRaw.data later — handle both shapes here too).
          const createdBy = projectRaw?.data?.created_by ?? projectRaw?.created_by;
          const isAdmin = user.role === 'admin';
          const isOwner = createdBy && createdBy === user.email;
          if (!isAdmin && !isOwner) {
            return Response.json({ error: 'Not authorized for this project', fnVersion: FN_VERSION }, { status: 403 });
          }
        }
        probe.projectRawType = typeof projectRaw;
        probe.projectRawKeys = projectRaw && typeof projectRaw === 'object' ? Object.keys(projectRaw).slice(0, 20) : null;
        if (!projectRaw || typeof projectRaw !== 'object') {
            return Response.json({ error: 'projects[0] not an object', fnVersion: FN_VERSION, probe }, { status: 500 });
        }
        const project = projectRaw.data && typeof projectRaw.data === 'object' ? projectRaw.data : projectRaw;
        if (!project || typeof project !== 'object') {
            return Response.json({ error: 'unwrapped project not an object', fnVersion: FN_VERSION, probe }, { status: 500 });
        }
        probe.projectKeys = Object.keys(project).slice(0, 20);
        probe.hasProjectName = 'project_name' in project;

        phase = 'fetch-tape-runs';
        const tapeRunsRaw = await tapeRunHandle.filter({ project_id });
        const tapeRuns = (tapeRunsRaw || []).map((r: any) => (r && r.data && typeof r.data === 'object' ? r.data : r));
        probe.tapeRunCount = tapeRuns.length;

        phase = 'pdf-header';
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text('ALKIMI', 20, 20);

        phase = 'pdf-project-info';
        let y = 35;
        doc.setFontSize(14);
        doc.setFont(undefined as any, 'bold');
        doc.text('Project Information', 20, y);
        y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined as any, 'normal');
        doc.text(`Project Name: ${project.project_name || ''}`, 20, y);
        y += 6;
        const customerName = (project.customer_name && project.customer_name !== '—') ? project.customer_name : '';
        doc.text(`Customer: ${customerName}`, 20, y);
        y += 6;
        if (project.customer_email) { doc.text(`Email: ${project.customer_email}`, 20, y); y += 6; }
        if (project.customer_phone) { doc.text(`Phone: ${project.customer_phone}`, 20, y); y += 6; }
        if (project.street || project.city || project.state) {
            const address = [project.street, project.city, project.state].filter(Boolean).join(', ');
            doc.text(`Address: ${address}`, 20, y); y += 6;
        }
        if (project.sector) { doc.text(`Sector: ${project.sector}`, 20, y); y += 6; }
        doc.text(`Status: ${project.status || ''}`, 20, y);
        y += 10;

        phase = 'pdf-runs-header';
        doc.setFontSize(14);
        doc.setFont(undefined as any, 'bold');
        doc.text('Configured Runs', 20, y); y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined as any, 'bold');
        doc.text('Type', 20, y); doc.text('Length', 48, y); doc.text('Output', 73, y);
        doc.text('CCT', 103, y); doc.text('Housing', 128, y); doc.text('Driver Group', 158, y); doc.text('Cost', 193, y);
        y += 7;
        doc.setFont(undefined as any, 'normal');

        phase = 'pdf-runs-loop';
        for (const runData of tapeRuns) {
            if (y > 270) { doc.addPage(); y = 20; }
            const totalIn = Math.round((runData.length_feet || 0) * 12);
            const feet = Math.floor(totalIn / 12);
            const inches = totalIn % 12;
            const lengthDisplay = `${feet}' ${inches}"`;
            const tapeSpec = TAPE_SPECS[runData.tape_output];
            const channelSpec = CHANNEL_SPECS[runData.channel_type];
            const outputDisplay = runData.tape_output || '';
            let cost = 0;
            if (tapeSpec) cost += (runData.length_feet || 0) * tapeSpec.price_per_foot;
            if (channelSpec && runData.channel_type !== 'none') {
                const sections = Math.ceil((runData.length_feet || 0) / 4);
                cost += sections * 4 * channelSpec.price_per_foot;
            }
            const channelDisplay = (runData.channel_type || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
            doc.text(runData.run_name || '', 20, y);
            doc.text(lengthDisplay, 48, y);
            doc.text(outputDisplay, 73, y);
            doc.text(runData.cct || '', 103, y);
            doc.text(channelDisplay, 128, y);
            doc.text(runData.driver_group || '', 158, y);
            doc.text(`$${cost.toFixed(2)}`, 193, y);
            y += 7;
        }

        phase = 'pdf-totals';
        y += 5;
        doc.setFont(undefined as any, 'bold');
        const totalFeet = tapeRuns.reduce((sum: number, r: any) => sum + (r.length_feet || 0), 0);
        const totalFeetTotalIn = Math.round((totalFeet || 0) * 12);
        const totalFeetDisplay = `${Math.floor(totalFeetTotalIn / 12)}' ${totalFeetTotalIn % 12}"`;
        doc.text(`Total Length: ${totalFeetDisplay}`, 20, y);
        y += 10;

        phase = 'pdf-pricing';
        doc.setFontSize(14);
        doc.text('Materials & Pricing', 20, y); y += 8;
        doc.setFontSize(10);
        doc.setFont(undefined as any, 'normal');

        const totalTapeCost = tapeRuns.reduce((sum: number, r: any) => {
            const spec = TAPE_SPECS[r.tape_output];
            return sum + (spec ? (r.length_feet || 0) * spec.price_per_foot : 0);
        }, 0);
        const totalChannelCost = tapeRuns.reduce((sum: number, r: any) => {
            const spec = CHANNEL_SPECS[r.channel_type];
            if (spec && r.channel_type !== 'none') {
                const sections = Math.ceil((r.length_feet || 0) / 4);
                return sum + sections * 4 * spec.price_per_foot;
            }
            return sum;
        }, 0);
        const totalWattage = tapeRuns.reduce((sum: number, r: any) => {
            const spec = TAPE_SPECS[r.tape_output];
            return sum + (spec ? (r.length_feet || 0) * spec.watts_per_foot : 0);
        }, 0);

        const projectDrivers = Array.isArray(project.drivers) ? project.drivers : [];
        let driverCost = 0;
        let driverLineLabel = '';
        if (projectDrivers.length > 0) {
            driverCost = projectDrivers.reduce((sum: number, d: any) => {
                const spec = DRIVER_SPECS[d.maxWatts];
                return sum + (spec ? spec.price : 0);
            }, 0);
            driverLineLabel = `Drivers (${projectDrivers.map((d: any) => `${d.maxWatts}W`).join('+')})`;
        } else {
            const defaultSpec = DRIVER_SPECS[DEFAULT_DRIVER_MAX_WATTS];
            const driversNeeded = Math.ceil(totalWattage / (defaultSpec.max_watts * DRIVER_LOAD_FACTOR));
            driverCost = driversNeeded * defaultSpec.price;
            driverLineLabel = `Drivers (${driversNeeded}x ${defaultSpec.max_watts}W)`;
        }

        const totalSections = tapeRuns.reduce((sum: number, r: any) => {
            if (r.channel_type !== 'none') return sum + Math.ceil((r.length_feet || 0) / 4);
            return sum;
        }, 0);
        const totalClips = totalSections * CLIPS_PER_SECTION;
        const clipSets = Math.ceil(totalClips / CLIPS_PER_SET);
        const clipCost = clipSets * CLIP_SET_PRICE;

        const subtotal = totalTapeCost + totalChannelCost + driverCost + clipCost;
        const shipping = subtotal * SHIPPING_RATE;
        const total = subtotal + shipping;

        const totalTapeFeet = tapeRuns.reduce((sum: number, r: any) => sum + (r.length_feet || 0), 0);
        doc.text(`Tape Light (${totalTapeFeet.toFixed(1)} ft): $${totalTapeCost.toFixed(2)}`, 20, y); y += 6;
        doc.text(`Channel Housing: $${totalChannelCost.toFixed(2)}`, 20, y); y += 6;
        doc.text(`${driverLineLabel}: $${driverCost.toFixed(2)}`, 20, y); y += 6;
        doc.text(`Mounting Hardware (${clipSets} sets): $${clipCost.toFixed(2)}`, 20, y); y += 6;

        const tapeToTapeConnectors = tapeRuns.reduce((sum: number, r: any) => {
            const spools = Math.ceil((r.length_feet || 0) / SPOOL_LENGTH_FEET);
            return sum + Math.max(0, spools - 1);
        }, 0);
        doc.text(`Tape-to-Tape Connectors: ${tapeToTapeConnectors} units`, 20, y); y += 6;
        doc.text(`Tape-to-Wire Connectors: ${tapeRuns.length} units`, 20, y); y += 6;
        doc.text(`Subtotal: $${subtotal.toFixed(2)}`, 20, y); y += 6;
        doc.text(`Shipping (${(SHIPPING_RATE * 100).toFixed(0)}%): $${shipping.toFixed(2)}`, 20, y); y += 8;
        doc.setFont(undefined as any, 'bold');
        doc.text(`Total: $${total.toFixed(2)}`, 20, y);

        if (project.notes) {
            y += 10;
            doc.setFont(undefined as any, 'bold');
            doc.text('Notes:', 20, y); y += 6;
            doc.setFont(undefined as any, 'normal');
            const splitNotes = doc.splitTextToSize(project.notes, 170);
            doc.text(splitNotes, 20, y);
        }

        phase = 'pdf-output';
        const pdfBytes = doc.output('arraybuffer');
        const filename = (project.project_name || 'estimate').replace(/[^a-zA-Z0-9-_ ]/g, '_');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            },
        });
    } catch (error: any) {
        return Response.json({
            error: error?.message || String(error),
            fnVersion: FN_VERSION,
            phase,
            probe,
            stack: error?.stack?.split('\n').slice(0, 5),
        }, { status: 500 });
    }
});
