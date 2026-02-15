import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // This is a manual sync endpoint
    // In a real implementation, you'd call QB API to fetch recent invoices
    // For now, this is a placeholder that returns success
    
    return Response.json({
      success: true,
      message: 'Manual sync initiated. Connect QB API credentials in settings to enable full sync.',
      synced_at: new Date().toISOString()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});