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

        const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id }, undefined, undefined, undefined, data_env);
        
        if (!projects || projects.length === 0) {
            return Response.json({ error: 'Project not found' }, { status: 404 });
        }
        
        const project = projects[0];
        const tapeRuns = await base44.asServiceRole.entities.TapeRun.filter({ project_id }, undefined, undefined, undefined, data_env);

        // Pricing constants — keep in sync with src/components/calculator/constants.jsx
        const CONSTANTS = {
            TAPE_SPECS: {
                "300lm (3w/ft)": { price_per_foot: 10, watts_per_foot: 3.0, lumens_per_foot: 300 },
                "360lm (3.6w/ft)": { price_per_foot: 11, watts_per_foot: 3.6, lumens_per_foot: 360 },
                "600lm (6w/ft)": { price_per_foot: 12, watts_per_foot: 6.0, lumens_per_foot: 600 }
            },
            CHANNEL_SPECS: {
                corner: { price_per_foot: 10 },
                recessed: { price_per_foot: 12 },
                surface: { price_per_foot: 8 },
                none: { price_per_foot: 0 }
            },
            DRIVER_MAX_WATTS: 96,
            DRIVER_LOAD_FACTOR: 0.8,
            DRIVER_PRICE: 65,
            CLIPS_PER_SECTION: 4,
            CLIPS_PER_SET: 12,
            CLIP_SET_PRICE: 15,
            SHIPPING_RATE: 0.10
        };
        const { TAPE_SPECS, CHANNEL_SPECS, DRIVER_MAX_WATTS, DRIVER_LOAD_FACTOR, DRIVER_PRICE, CLIPS_PER_SECTION, CLIPS_PER_SET, CLIP_SET_PRICE, SHIPPING_RATE } = CONSTANTS;

        // Build CSV
        let csv = '';
        
        // Project Information Section
        csv += 'PROJECT INFORMATION\n';
        csv += 'Field,Value\n';
        csv += `Project Name,${escapeCSV(project.data.project_name)}\n`;
        csv += `Customer Name,${escapeCSV(project.data.customer_name)}\n`;
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
            const tapeSpec = TAPE_SPECS[runData.tape_type];
            const channelSpec = CHANNEL_SPECS[runData.channel_type];
            const outputDisplay = runData.tape_type || '';
            
            // Calculate cost with rounded channel sections
            let cost = 0;
            if (tapeSpec) cost += runData.length_feet * tapeSpec.price_per_foot;
            if (channelSpec && runData.channel_type !== 'none') {
                const sections = Math.ceil(runData.length_feet / 4);
                const actualFeet = sections * 4;
                cost += actualFeet * channelSpec.price_per_foot;
            }
            
            const channelDisplay = runData.channel_type === 'recessed' ? 'Recessed Flange' : 
                                   runData.channel_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
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
            const spec = TAPE_SPECS[runData.tape_type];
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
            const spec = TAPE_SPECS[runData.tape_type];
            return sum + (spec ? runData.length_feet * spec.watts_per_foot : 0);
        }, 0);

        const driversNeeded = Math.ceil(totalWattage / (DRIVER_MAX_WATTS * DRIVER_LOAD_FACTOR));
        const driverCost = driversNeeded * DRIVER_PRICE;
        
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
        csv += `Drivers (${DRIVER_MAX_WATTS}W),${driversNeeded},${driverCost.toFixed(2)}\n`;
        csv += `Mounting Hardware,${clipSets} sets,${clipCost.toFixed(2)}\n`;
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