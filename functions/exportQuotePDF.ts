import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectData, runs } = await req.json();

    // Create PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Title
    doc.setFontSize(24);
    doc.setFont(undefined, 'bold');
    doc.text('LIGHTING QUOTE', 20, yPos);
    yPos += 15;

    // Project Details
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Project: ${projectData.project_name}`, 20, yPos);
    yPos += 6;
    doc.text(`Customer: ${projectData.customer_name}`, 20, yPos);
    yPos += 6;
    if (projectData.customer_email) {
      doc.text(`Email: ${projectData.customer_email}`, 20, yPos);
      yPos += 6;
    }
    if (projectData.customer_phone) {
      doc.text(`Phone: ${projectData.customer_phone}`, 20, yPos);
      yPos += 6;
    }
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, yPos);
    yPos += 10;

    // Tape Runs
    doc.setFont(undefined, 'bold');
    doc.text('CONFIGURED TAPE RUNS', 20, yPos);
    yPos += 8;
    doc.setFont(undefined, 'normal');

    runs.forEach(run => {
      const feet = Math.floor(run.length_feet);
      const inches = Math.round((run.length_feet % 1) * 12);
      const tapeType = run.tape_type.replace(/_/g, ' ').toUpperCase();
      const channelType = run.channel_type.replace(/_/g, ' ').toUpperCase();
      
      doc.text(`${run.run_name || 'Run'}: ${feet}'${inches}" ${tapeType}`, 20, yPos);
      yPos += 5;
      doc.setFontSize(9);
      doc.text(`Housing: ${channelType} | Driver: ${run.driver_type}`, 25, yPos);
      yPos += 5;
      doc.setFontSize(10);
      
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
      }
    });

    yPos += 5;

    // Materials Summary
    doc.setFont(undefined, 'bold');
    doc.text('MATERIALS REQUIRED', 20, yPos);
    yPos += 8;
    doc.setFont(undefined, 'normal');

    // Calculate totals
    const TAPE_SPECS = {
      '2700k': { watts_per_foot: 4.4, price_per_foot: 12 },
      '3000k': { watts_per_foot: 4.4, price_per_foot: 12 },
      '3500k': { watts_per_foot: 4.4, price_per_foot: 12 },
      'warm_dim': { watts_per_foot: 7.2, price_per_foot: 18 },
      'tunable_white': { watts_per_foot: 9.6, price_per_foot: 24 },
      'standard_white': { watts_per_foot: 4.4, price_per_foot: 12 },
      'standard_warm': { watts_per_foot: 4.4, price_per_foot: 12 },
      'rgb': { watts_per_foot: 7.2, price_per_foot: 18 },
      'rgbw': { watts_per_foot: 9.6, price_per_foot: 24 },
      'high_output': { watts_per_foot: 7.2, price_per_foot: 18 }
    };

    const CHANNEL_SPECS = {
      surface_mount: { price_per_foot: 8 },
      recessed: { price_per_foot: 12 },
      corner: { price_per_foot: 10 },
      none: { price_per_foot: 0 }
    };

    const DRIVER_SPECS = [
      { max_watts: 60, price: 45, name: "60W Driver" },
      { max_watts: 96, price: 65, name: "96W Driver" }
    ];

    const tapeByType = {};
    let totalWatts = 0;
    
    runs.forEach(run => {
      const type = run.tape_type;
      if (!tapeByType[type]) {
        tapeByType[type] = { feet: 0, watts: 0, cost: 0 };
      }
      const specs = TAPE_SPECS[type] || { watts_per_foot: 4.4, price_per_foot: 12 };
      tapeByType[type].feet += run.length_feet;
      tapeByType[type].watts += run.length_feet * specs.watts_per_foot;
      tapeByType[type].cost += run.length_feet * specs.price_per_foot;
      totalWatts += run.length_feet * specs.watts_per_foot;
    });

    Object.entries(tapeByType).forEach(([type, data]) => {
      const feet = Math.floor(data.feet);
      const inches = Math.round((data.feet % 1) * 12);
      const typeLabel = type.replace(/_/g, ' ').toUpperCase();
      doc.text(`${typeLabel}: ${feet}'${inches}"`, 20, yPos);
      yPos += 5;
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = 20;
      }
    });

    yPos += 3;

    // Pricing Summary
    if (yPos > pageHeight - 50) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFont(undefined, 'bold');
    doc.text('PRICING SUMMARY', 20, yPos);
    yPos += 8;
    doc.setFont(undefined, 'normal');

    const tapeCost = Object.values(tapeByType).reduce((sum, t) => sum + t.cost, 0);
    const channelCost = runs.reduce((sum, run) => {
      if (run.channel_type === 'none') return sum;
      const specs = CHANNEL_SPECS[run.channel_type];
      return sum + (run.length_feet * specs.price_per_foot);
    }, 0);

    const requiredDrivers = [];
    let remainingWatts = totalWatts;
    while (remainingWatts > 0) {
      const driver = DRIVER_SPECS.find(d => d.max_watts >= remainingWatts) || DRIVER_SPECS[DRIVER_SPECS.length - 1];
      requiredDrivers.push(driver);
      remainingWatts -= driver.max_watts;
    }
    const driverCost = requiredDrivers.reduce((sum, d) => sum + d.price, 0);
    const terminalBlockCost = requiredDrivers.length * 8;
    const totalClips = runs.reduce((sum, run) => {
      if (run.channel_type === 'none') return sum;
      const sections = Math.ceil(run.length_feet / 4);
      return sum + (sections * 4);
    }, 0);
    const clipCost = Math.ceil(totalClips / 50) * 15;
    const totalCost = tapeCost + channelCost + driverCost + terminalBlockCost + clipCost;

    const formatUSD = (amount) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    doc.text(`Tape Light: $${formatUSD(tapeCost)}`, 20, yPos);
    yPos += 5;
    if (channelCost > 0) {
      doc.text(`Housings: $${formatUSD(channelCost)}`, 20, yPos);
      yPos += 5;
    }
    doc.text(`Drivers: $${formatUSD(driverCost)}`, 20, yPos);
    yPos += 5;
    doc.text(`Terminal Blocks: $${formatUSD(terminalBlockCost)}`, 20, yPos);
    yPos += 5;
    doc.text(`Mounting Hardware: $${formatUSD(clipCost)}`, 20, yPos);
    yPos += 8;

    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text(`TOTAL: $${formatUSD(totalCost)}`, 20, yPos);

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${projectData.project_name || 'quote'}.pdf"`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});