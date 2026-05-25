import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// SHA and timestamp are stamped here at deploy time.
// Update these values whenever a new version is deployed.
const VERSION_SHA = '807007d';
const VERSION_TS = new Date().toISOString();

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return Response.json({
        sha: VERSION_SHA,
        ts: VERSION_TS,
        runtime: 'deno',
    });
});