import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { event, data_env } = await req.json();

  const projectId = event?.entity_id;
  if (!projectId) {
    return Response.json({ error: 'No entity_id in event' }, { status: 400 });
  }

  // Pass data_env positionally so cascade stays within the same environment as
  // the originating project delete. Without it, a staging delete could miss
  // staging children or cross over to prod.
  const runs = await base44.asServiceRole.entities.TapeRun.filter(
    { project_id: projectId }, undefined, undefined, undefined, data_env
  );
  for (const run of runs) {
    await base44.asServiceRole.entities.TapeRun.delete(run.id, data_env);
  }

  return Response.json({ deleted: runs.length });
});