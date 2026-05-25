import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
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

        const body = await req.json().catch(() => ({}));
        const { project_id } = body || {};
        // data_env intentionally NOT read from body (Codex P0 pattern — see #22).

        if (!project_id) {
            return Response.json({ error: 'Project ID required' }, { status: 400 });
        }

        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });

        if (!projects || projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }

        const project = projects[0];

        // OWNERSHIP CHECK (task #21 — Codex P0 from comprehensive audit 2026-05-24).
        // Auth was already enforced (line 18). Fetching via service-role and
        // exporting unconditionally meant any authenticated user knowing a
        // project_id could pull another rep's customer + tape-run data as CSV.
        {
          // Defend against Base44's optional wrapper shape (rest of this
          // function uses project.data.* — confirmed by Codex pass).
          const createdBy = project?.data?.created_by ?? project?.created_by;
          const isAdmin = user.role === 'admin';
          const isOwner = createdBy && createdBy === user.email;
          if (!isAdmin && !isOwner) {
            return Response.json({ error: 'Not authorized for this project' }, { status: 403 });
          }
        }

        const tapeRuns = await base44.asServiceRole.entities.TapeRun.filter({ project_id });

        // Build CSV
        let csv = '';
        
        // Project Information Section
        csv += 'PROJECT INFORMATION\n';
        csv += 'Field,Value\n';
        csv += `Project Name,${escapeCSV(project.data.project_name)}\n`;
        // Treat legacy '—' placeholder as blank.
        const customerName = (project.data.customer_name && project.data.customer_name !== '—') ? project.data.customer_name : '';
        csv += `Customer Name,${escapeCSV(customerName)}\n`;
        csv += `Customer Email,${escapeCSV(project.data.customer_email || '')}\n`;
        csv += `Customer Phone,${escapeCSV(project.data.customer_phone || '')}\n`;
        csv += `Address,${escapeCSV([project.data.street, project.data.city, project.data.state].filter(Boolean).join(', '))}\n`;
        csv += `Sector,${escapeCSV(project.data.sector || '')}\n`;
        csv += `Status,${escapeCSV(project.data.status)}\n`;
        csv += '\n';

        // Configured Runs Section
        csv += 'CONFIGURED RUNS\n';
        csv += 'Type,Length (ft),Output,CCT,Housing,Notes,Driver Group,Cost\n';
        
        tapeRuns.forEach((run) => {
            const runData = run.data || run;
            const lengthDisplay = runData.length_feet.toFixed(2);
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
            
            csv += `${escapeCSV(runData.run_name || '')},${lengthDisplay},${escapeCSV(outputDisplay)},${escapeCSV(runData.cct || '')},${escapeCSV(channelDisplay)},${escapeCSV(runData.notes || '')},${escapeCSV(runData.driver_group || '')},${cost.toFixed(2)}\n`;
        });
        
        const totalFeet = tapeRuns.reduce((sum, r) => {
            const runData = r.data || r;
            return sum + runData.length_feet;
        }, 0);
        csv += `\nTotal Length,${totalFeet.toFixed(2)} ft\n`;
        csv += '\n';

        // Materials & Pricing Section
        csv += 'MATERIALS & PRICING\n';
        csv += 'Item,Quantity,Cost\n';

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
        const projectDrivers = (project.data.drivers || []);
        let driversNeeded;
        let driverCost;
        let driverLineLabel;
        if (projectDrivers.length > 0) {
            driversNeeded = projectDrivers.length;
            driverCost = projectDrivers.reduce((sum, d) => {
                const spec = DRIVER_SPECS[d.maxWatts];
                return sum + (spec ? spec.price : 0);
            }, 0);
            const wattageMix = projectDrivers.map(d => `${d.maxWatts}W`).join('+');
            driverLineLabel = `Drivers (${wattageMix})`;
        } else {
            const defaultSpec = DRIVER_SPECS[DEFAULT_DRIVER_MAX_WATTS];
            driversNeeded = Math.ceil(totalWattage / (defaultSpec.max_watts * DRIVER_LOAD_FACTOR));
            driverCost = driversNeeded * defaultSpec.price;
            driverLineLabel = `Drivers (${defaultSpec.max_watts}W)`;
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

        csv += `Tape Light,${totalTapeFeet.toFixed(1)} ft,${totalTapeCost.toFixed(2)}\n`;
        csv += `Channel Housing,-,${totalChannelCost.toFixed(2)}\n`;
        csv += `${driverLineLabel},${driversNeeded},${driverCost.toFixed(2)}\n`;
        csv += `Mounting Hardware,${clipSets} sets,${clipCost.toFixed(2)}\n`;
        // Connectors counted but not priced (mirrors on-screen Materials panel).
        const tapeToTapeConnectors = tapeRuns.reduce((sum, run) => {
            const runData = run.data || run;
            const spools = Math.ceil((runData.length_feet || 0) / SPOOL_LENGTH_FEET);
            return sum + Math.max(0, spools - 1);
        }, 0);
        csv += `Tape-to-Tape Connectors,${tapeToTapeConnectors} units,-\n`;
        csv += `Tape-to-Wire Connectors,${tapeRuns.length} units,-\n`;
        csv += `Subtotal,-,${subtotal.toFixed(2)}\n`;
        csv += `Shipping (${(SHIPPING_RATE * 100).toFixed(0)}%),-,${shipping.toFixed(2)}\n`;
        csv += `TOTAL,-,${total.toFixed(2)}\n`;

        if (project.data.notes) {
            csv += '\nNOTES\n';
            csv += `${escapeCSV(project.data.notes)}\n`;
        }

        return new Response(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${project.data.project_name}.csv"`
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function escapeCSV(value) {
    if (!value) return '';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}