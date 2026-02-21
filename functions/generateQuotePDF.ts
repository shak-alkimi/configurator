import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { project, tapeRuns, materials, data_env } = await req.json();

        if (!project) {
            return Response.json({ error: 'Project data required' }, { status: 400 });
        }

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let y = 20;

        // Header with logo and title
        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.text('ALKIMI LIGHTING', 20, y);
        y += 12;

        // Quote label
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text('Professional Quote', 20, y);
        y += 10;

        // Project details section
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text('Project Information', 20, y);
        y += 7;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Project: ${project.project_name}`, 20, y);
        y += 5;
        doc.text(`Customer: ${project.customer_name}`, 20, y);
        y += 5;
        doc.text(`Email: ${project.customer_email || 'N/A'}`, 20, y);
        y += 5;
        doc.text(`Phone: ${project.customer_phone || 'N/A'}`, 20, y);
        y += 5;

        // Address
        let address = '';
        if (project.street) address += project.street;
        if (project.city) address += (address ? ', ' : '') + project.city;
        if (project.state) address += (address ? ', ' : '') + project.state;
        if (address) {
            doc.text(`Address: ${address}`, 20, y);
            y += 5;
        }

        if (project.sector) {
            doc.text(`Sector: ${project.sector}`, 20, y);
            y += 5;
        }

        y += 5;

        // Materials breakdown
        doc.setFont(undefined, 'bold');
        doc.setFontSize(11);
        doc.text('Materials Summary', 20, y);
        y += 7;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');

        const materialItems = [
            { label: 'Tape Light', amount: materials.tapeCost },
            { label: 'Housing', amount: materials.channelCost },
            { label: 'Drivers', amount: materials.driverCost },
            { label: 'Mounting Hardware', amount: materials.clipCost },
            { label: 'Shipping', amount: materials.shippingCost }
        ];

        materialItems.forEach(item => {
            if (item.amount > 0 || item.label === 'Tape Light' || item.label === 'Drivers') {
                const amount = `$${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                doc.text(item.label, 20, y);
                doc.text(amount, pageWidth - 40, y, { align: 'right' });
                y += 6;
            }
        });

        y += 2;
        doc.setFont(undefined, 'bold');
        doc.setFontSize(12);
        const totalAmount = `$${materials.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        doc.text('Total Project Cost:', 20, y);
        doc.text(totalAmount, pageWidth - 40, y, { align: 'right' });

        y += 12;

        // Tape runs details
        if (tapeRuns.length > 0) {
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text('Tape Run Specifications', 20, y);
            y += 7;

            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            doc.text('Run', 20, y);
            doc.text('Length', 60, y);
            doc.text('Type', 100, y);
            doc.text('CCT', 140, y);
            doc.text('Housing', 170, y);
            y += 6;

            doc.setFont(undefined, 'normal');
            tapeRuns.forEach((run) => {
                if (y > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }

                const feet = Math.floor(run.length_feet);
                const inches = Math.round((run.length_feet % 1) * 12);
                const lengthDisplay = `${feet}' ${inches}"`;
                const tapeDisplay = run.tape_type === '2w' ? '2W' : '4W';
                const housingDisplay = run.channel_type === 'recessed' ? 'Recessed' : 
                                      run.channel_type === 'corner' ? 'Corner' : 
                                      run.channel_type === 'surface' ? 'Surface' : 'None';
                const cctDisplay = run.cct ? run.cct.split(' ')[0] : 'N/A';

                doc.text(run.run_name || `Run ${tapeRuns.indexOf(run) + 1}`, 20, y);
                doc.text(lengthDisplay, 60, y);
                doc.text(tapeDisplay, 100, y);
                doc.text(cctDisplay, 140, y);
                doc.text(housingDisplay, 170, y);
                y += 6;
            });
        }

        // Footer
        y = pageHeight - 15;
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text(`Quote generated on ${new Date().toLocaleDateString()}`, 20, y);
        doc.text('This quote is valid for 30 days', pageWidth - 40, y, { align: 'right' });

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${project.project_name}_Quote.pdf"`
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});