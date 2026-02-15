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
    doc.text('SUBMITTAL PACKAGE', 20, yPos);
    yPos += 15;

    // Project Info
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Project: ${projectData.project_name}`, 20, yPos);
    yPos += 6;
    doc.text(`Customer: ${projectData.customer_name}`, 20, yPos);
    yPos += 6;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, yPos);
    yPos += 12;

    // Spec Sheets for each run
    runs.forEach((run, index) => {
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = 20;
      }

      // Run Header
      doc.setFont(undefined, 'bold');
      doc.setFontSize(12);
      doc.text(`RUN ${index + 1}: ${run.run_name || 'Tape Run'}`, 20, yPos);
      yPos += 8;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);

      // Basic Specs
      const feet = Math.floor(run.length_feet);
      const inches = Math.round((run.length_feet % 1) * 12);
      const tapeType = run.tape_type.replace(/_/g, ' ').toUpperCase();
      const channelType = run.channel_type.replace(/_/g, ' ').toUpperCase();
      const driverType = run.driver_type.toUpperCase();

      doc.text(`Length: ${feet}'${inches}"`, 20, yPos);
      yPos += 5;
      doc.text(`Tape Type: ${tapeType}`, 20, yPos);
      yPos += 5;
      doc.text(`Housing: ${channelType}`, 20, yPos);
      yPos += 5;
      doc.text(`Driver: ${driverType}`, 20, yPos);
      yPos += 5;
      if (run.notes) {
        doc.text(`Notes: ${run.notes}`, 20, yPos);
        yPos += 5;
      }

      yPos += 3;

      // Technical Specifications
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      doc.text('TECHNICAL SPECIFICATIONS', 20, yPos);
      yPos += 6;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);

      const TAPE_SPECS = {
        '2700k': { watts_per_foot: 4.4, lumens_per_foot: 240, cri: 90 },
        '3000k': { watts_per_foot: 4.4, lumens_per_foot: 260, cri: 90 },
        '3500k': { watts_per_foot: 4.4, lumens_per_foot: 280, cri: 90 },
        'warm_dim': { watts_per_foot: 7.2, lumens_per_foot: 420, cri: 90 },
        'tunable_white': { watts_per_foot: 9.6, lumens_per_foot: 560, cri: 90 },
        'rgb': { watts_per_foot: 7.2, lumens_per_foot: 400, cri: 'N/A' },
        'rgbw': { watts_per_foot: 9.6, lumens_per_foot: 560, cri: 90 },
        'high_output': { watts_per_foot: 7.2, lumens_per_foot: 450, cri: 90 }
      };

      const tapeSpecs = TAPE_SPECS[run.tape_type] || TAPE_SPECS['standard_white'];
      const totalWatts = (run.length_feet * tapeSpecs.watts_per_foot).toFixed(1);
      const totalLumens = (run.length_feet * tapeSpecs.lumens_per_foot).toFixed(0);

      doc.text(`• Power Consumption: ${totalWatts}W (${tapeSpecs.watts_per_foot}W per foot)`, 22, yPos);
      yPos += 4;
      doc.text(`• Total Lumens: ~${totalLumens}lm`, 22, yPos);
      yPos += 4;
      doc.text(`• Color Rendering Index (CRI): ${tapeSpecs.cri}`, 22, yPos);
      yPos += 4;
      doc.text(`• LED Lifespan: 50,000+ hours`, 22, yPos);
      yPos += 4;
      doc.text(`• Operating Voltage: 24VDC`, 22, yPos);
      yPos += 4;
      doc.text(`• Housing Type: ${channelType}`, 22, yPos);
      yPos += 4;
      doc.text(`• Driver: ${driverType} (Max ${driverType === '60W' ? '60' : '96'}W capacity)`, 22, yPos);
      yPos += 8;
    });

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${projectData.project_name || 'submittal'} - Submittal Package.pdf"`
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});