import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { event } = await req.json();

  const projectId = event.entity_id;
  if (!projectId) {
    return Response.json({ error: 'No entity_id in event' }, { status: 400 });
  }

  const runs = await base44.asServiceRole.entities.TapeRun.filter({ project_id: projectId });
  await Promise.all(runs.map(run => base44.asServiceRole.entities.TapeRun.delete(run.id)));

  return Response.json({ deleted: runs.length });
});