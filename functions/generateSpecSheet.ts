import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectData, tapeRuns, materialsData } = await req.json();

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 10;

    // Title
    doc.setFontSize(20);
    doc.text('SPECIFICATION SHEET', pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Project Info
    doc.setFontSize(12);
    doc.text('PROJECT INFORMATION', 10, yPos);
    yPos += 7;
    doc.setFontSize(10);
    doc.text(`Project: ${projectData.project_name}`, 10, yPos);
    yPos += 5;
    doc.text(`Customer: ${projectData.customer_name}`, 10, yPos);
    yPos += 5;
    if (projectData.customer_email) {
      doc.text(`Email: ${projectData.customer_email}`, 10, yPos);
      yPos += 5;
    }
    if (projectData.customer_phone) {
      doc.text(`Phone: ${projectData.customer_phone}`, 10, yPos);
      yPos += 5;
    }
    yPos += 5;

    // Tape Runs
    doc.setFontSize(12);
    doc.text('CONFIGURED RUNS', 10, yPos);
    yPos += 7;
    doc.setFontSize(10);

    tapeRuns.forEach((run, idx) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 10;
      }
      doc.text(`Run ${idx + 1}: ${run.run_name || `Run ${idx + 1}`}`, 10, yPos);
      yPos += 5;
      doc.text(`  Length: ${run.length_feet}' | Tape: ${run.tape_type} | Housing: ${run.channel_type} | Driver: ${run.driver_type}`, 10, yPos);
      yPos += 5;
      if (run.notes) {
        doc.text(`  Notes: ${run.notes}`, 10, yPos);
        yPos += 5;
      }
      yPos += 2;
    });

    yPos += 5;

    // Materials Summary
    doc.setFontSize(12);
    doc.text('MATERIALS SUMMARY', 10, yPos);
    yPos += 7;
    doc.setFontSize(10);

    // Tape Light
    doc.text('Tape Light:', 10, yPos);
    yPos += 4;
    Object.entries(materialsData.tapeByType).forEach(([type, data]) => {
      const feet = Math.floor(data.feet);
      const inches = Math.round((data.feet % 1) * 12);
      doc.text(`  ${type}: ${feet}'${inches}"`, 10, yPos);
      yPos += 4;
    });
    yPos += 2;

    // Housings
    if (Object.keys(materialsData.channelByType).length > 0) {
      doc.text('Housings:', 10, yPos);
      yPos += 4;
      Object.entries(materialsData.channelByType).forEach(([type, data]) => {
        const feet = Math.floor(data.feet);
        const inches = Math.round((data.feet % 1) * 12);
        doc.text(`  ${type}: ${feet}'${inches}"`, 10, yPos);
        yPos += 4;
      });
      yPos += 2;
    }

    // Drivers
    doc.text('Drivers:', 10, yPos);
    yPos += 4;
    const driverCounts = {};
    materialsData.requiredDrivers.forEach(driver => {
      const key = `${driver.max_watts}W`;
      driverCounts[key] = (driverCounts[key] || 0) + 1;
    });
    Object.entries(driverCounts).forEach(([wattage, count]) => {
      doc.text(`  ${wattage} Driver: ${count}`, 10, yPos);
      yPos += 4;
    });
    yPos += 2;

    // Terminal Blocks
    doc.text(`Terminal Blocks: ${materialsData.terminalBlocks}`, 10, yPos);
    yPos += 4;

    // External Clips
    doc.text(`External Clips: ${materialsData.totalClips}`, 10, yPos);
    yPos += 8;

    // Cost Summary
    doc.setFontSize(12);
    doc.text('COST SUMMARY', 10, yPos);
    yPos += 7;
    doc.setFontSize(10);

    const formatUSD = (amount) => amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    doc.text(`Tape Light: $${formatUSD(materialsData.tapeCost)}`, 10, yPos);
    yPos += 4;
    if (materialsData.channelCost > 0) {
      doc.text(`Housings: $${formatUSD(materialsData.channelCost)}`, 10, yPos);
      yPos += 4;
    }
    doc.text(`Drivers: $${formatUSD(materialsData.driverCost)}`, 10, yPos);
    yPos += 4;
    doc.text(`Terminal Blocks: $${formatUSD(materialsData.terminalBlockCost)}`, 10, yPos);
    yPos += 4;
    doc.text(`Mounting Hardware: $${formatUSD(materialsData.clipCost)}`, 10, yPos);
    yPos += 6;

    // Total
    doc.setFontSize(12);
    doc.text(`TOTAL: $${formatUSD(materialsData.totalCost)}`, 10, yPos);

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${projectData.project_name}-spec-sheet.pdf"`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});