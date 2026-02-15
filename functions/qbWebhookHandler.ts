import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // Validate webhook (you'll set a shared secret in QB webhook config)
    const webhookSecret = Deno.env.get('QB_WEBHOOK_SECRET');
    const signature = req.headers.get('qb-signature');
    
    if (!signature || signature !== webhookSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse QB invoice data
    const { entity_type, operation, data } = body;
    
    if (entity_type !== 'Invoice' || operation !== 'Create') {
      return Response.json({ success: true });
    }

    // Extract line items from QB invoice
    const lineItems = data.line_items || [];
    
    for (const item of lineItems) {
      // Find inventory record by product name/SKU
      const inventory = await base44.asServiceRole.entities.Inventory.filter({
        product_id: item.sku || item.product_id
      });

      if (inventory.length > 0) {
        const inv = inventory[0];
        const quantity = item.quantity || 0;
        
        // Decrement inventory
        await base44.asServiceRole.entities.Inventory.update(inv.id, {
          quantity_on_hand: Math.max(0, inv.quantity_on_hand - quantity),
          last_synced: new Date().toISOString()
        });
      }
    }

    return Response.json({ success: true, items_processed: lineItems.length });
  } catch (error) {
    console.error('QB webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});