import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// exportProjectCSV — admin/owner-only CSV export of a project + tape runs.
//
// HISTORY:
//   This function previously imported pricing constants from
//   ../../shared/pricing.js. Per memory:alkimi-base44-sync (verified 2026-05-23
//   on the SOS functions), Base44's Deno bundler cannot resolve relative
//   imports out of base44/shared/, so the draft deploy silently fails and
//   production keeps serving a stale/broken bundle → 500 on every call. That
//   was task #98 (sibling of #11). Fix: inline the pricing constants here.
//   The frontend (src/components/calculator/constants.jsx) still imports from
//   base44/shared/pricing.js via Vite, which resolves it fine.
//
//   Also: Base44 returns flat entity objects (no .data wrapper) per
//   memory:alkimi-base44-sync. Prior code used `project.data.project_name`
//   etc. and was crashing on `undefined.project_name`. Switched to flat access
//   throughout with `project?.data?.<f> ?? project?.<f>` only where defensible.
//
// AUDIT (AGENTS.md Alkimi-specific trigger): if you edit the inlined
// constants here, also edit base44/functions/exportProjectPDF/entry.ts AND
// base44/shared/pricing.js AND src/components/calculator/constants.jsx. The
// shared file remains the canonical reference; the Deno copies are a
// platform-imposed duplicate.

// ── Inlined pricing constants (mirror of base44/shared/pricing.js) ───────────

const TAPE_SPECS = {
  '300lm (3.0w/ft)': { price_per_foot: 10, watts_per_foot: 3.0, lumens_per_foot: 300 },
  '360lm (3.6w/ft)': { price_per_foot: 11, watts_per_foot: 3.6, lumens_per_foot: 360 },
  '600lm (6.0w/ft)': { price_per_foot: 12, watts_per_foot: 6.0, lumens_per_foot: 600 },
};
const CHANNEL_SPECS = {
  corner: { price_per_foot: 10, clips_per_4ft: 4 },
  surface: { price_per_foot: 8, clips_per_4ft: 4 },
  none: { price_per_foot: 0, clips_per_4ft: 0 },
};
const DRIVER_SPECS = {
  60: { max_watts: 60, price: 55, name: '60W Driver' },
  96: { max_watts: 96, price: 65, name: '96W Driver' },
};
const DEFAULT_DRIVER_MAX_WATTS = 96;
const DRIVER_LOAD_FACTOR = 0.8;
const CLIPS_PER_SECTION = 4;
const CLIPS_PER_SET = 12;
const CLIP_SET_PRICE = 15;
const SPOOL_LENGTH_FEET = 16 + (4 / 12);
const SHIPPING_RATE = 0.10;

// Defensive flat/wrapped accessor — Base44 returns flat in this app, but defend
// against the .data wrapper shape so a platform change doesn't silently break
// the export.
const flat = (obj) => (obj && typeof obj === 'object' && obj.data && typeof obj.data === 'object') ? { ...obj.data, id: obj.id ?? obj.data.id, created_by: obj.data.created_by ?? obj.created_by } : obj;

function escapeCSV(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { project_id } = body || {};
    // data_env intentionally NOT read from body (#22 unified pattern).

    if (!project_id) {
      return Response.json({ error: 'Project ID required' }, { status: 400 });
    }

    const projects = await base44.asServiceRole.entities.Project.filter({ id: project_id });
    if (!projects || projects.length === 0) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    const project = flat(projects[0]);

    // OWNERSHIP CHECK (task #21).
    {
      const isAdmin = user.role === 'admin';
      const isOwner = project?.created_by && project.created_by === user.email;
      if (!isAdmin && !isOwner) {
        return Response.json({ error: 'Not authorized for this project' }, { status: 403 });
      }
    }

    const rawRuns = await base44.asServiceRole.entities.TapeRun.filter({ project_id });
    const tapeRuns = (rawRuns || []).map(flat);

    // ── Build CSV ─────────────────────────────────────────────────────────────
    let csv = '';
    csv += 'PROJECT INFORMATION\n';
    csv += 'Field,Value\n';
    csv += `Project Name,${escapeCSV(project.project_name)}\n`;
    const customerName = (project.customer_name && project.customer_name !== '—') ? project.customer_name : '';
    csv += `Customer Name,${escapeCSV(customerName)}\n`;
    csv += `Customer Email,${escapeCSV(project.customer_email || '')}\n`;
    csv += `Customer Phone,${escapeCSV(project.customer_phone || '')}\n`;
    csv += `Address,${escapeCSV([project.street, project.city, project.state].filter(Boolean).join(', '))}\n`;
    csv += `Sector,${escapeCSV(project.sector || '')}\n`;
    csv += `Status,${escapeCSV(project.status)}\n`;
    csv += '\n';

    csv += 'CONFIGURED RUNS\n';
    csv += 'Type,Length (ft),Output,CCT,Housing,Notes,Driver Group,Cost\n';
    for (const run of tapeRuns) {
      const lengthDisplay = (run.length_feet ?? 0).toFixed(2);
      const tapeSpec = TAPE_SPECS[run.tape_output];
      const channelSpec = CHANNEL_SPECS[run.channel_type];
      let cost = 0;
      if (tapeSpec) cost += (run.length_feet || 0) * tapeSpec.price_per_foot;
      if (channelSpec && run.channel_type !== 'none') {
        const sections = Math.ceil((run.length_feet || 0) / 4);
        cost += sections * 4 * channelSpec.price_per_foot;
      }
      const channelDisplay = (run.channel_type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      csv += `${escapeCSV(run.run_name || '')},${lengthDisplay},${escapeCSV(run.tape_output || '')},${escapeCSV(run.cct || '')},${escapeCSV(channelDisplay)},${escapeCSV(run.notes || '')},${escapeCSV(run.driver_group || '')},${cost.toFixed(2)}\n`;
    }
    const totalFeet = tapeRuns.reduce((sum, r) => sum + (r.length_feet || 0), 0);
    csv += `\nTotal Length,${totalFeet.toFixed(2)} ft\n\n`;

    // ── Materials & Pricing ──────────────────────────────────────────────────
    csv += 'MATERIALS & PRICING\n';
    csv += 'Item,Quantity,Cost\n';

    const totalTapeFeet = totalFeet;
    const totalTapeCost = tapeRuns.reduce((sum, r) => {
      const spec = TAPE_SPECS[r.tape_output];
      return sum + (spec ? (r.length_feet || 0) * spec.price_per_foot : 0);
    }, 0);
    const totalChannelCost = tapeRuns.reduce((sum, r) => {
      const spec = CHANNEL_SPECS[r.channel_type];
      if (spec && r.channel_type !== 'none') {
        return sum + Math.ceil((r.length_feet || 0) / 4) * 4 * spec.price_per_foot;
      }
      return sum;
    }, 0);
    const totalWattage = tapeRuns.reduce((sum, r) => {
      const spec = TAPE_SPECS[r.tape_output];
      return sum + (spec ? (r.length_feet || 0) * spec.watts_per_foot : 0);
    }, 0);

    const projectDrivers = project.drivers || [];
    let driversNeeded, driverCost, driverLineLabel;
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
      driverLineLabel = `Drivers (${defaultSpec.max_watts}W)`;
    }

    const totalSections = tapeRuns.reduce((sum, r) => {
      if (r.channel_type !== 'none') return sum + Math.ceil((r.length_feet || 0) / 4);
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
    const tapeToTapeConnectors = tapeRuns.reduce((sum, r) => {
      const spools = Math.ceil((r.length_feet || 0) / SPOOL_LENGTH_FEET);
      return sum + Math.max(0, spools - 1);
    }, 0);
    csv += `Tape-to-Tape Connectors,${tapeToTapeConnectors} units,-\n`;
    csv += `Tape-to-Wire Connectors,${tapeRuns.length} units,-\n`;
    csv += `Subtotal,-,${subtotal.toFixed(2)}\n`;
    csv += `Shipping (${(SHIPPING_RATE * 100).toFixed(0)}%),-,${shipping.toFixed(2)}\n`;
    csv += `TOTAL,-,${total.toFixed(2)}\n`;

    if (project.notes) {
      csv += '\nNOTES\n';
      csv += `${escapeCSV(project.notes)}\n`;
    }

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${(project.project_name || 'project').replace(/[^\w\- .]/g, '_')}.csv"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});
