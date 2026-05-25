import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// cascadeDeleteTapeRuns — cascade child TapeRuns when a Project is deleted.
// Hardened against direct misuse per Codex P0 from comprehensive audit
// 2026-05-24 (task #23):
//
//   Previously the function had NO auth check and trusted body-supplied
//   `data_env`. Any caller could POST { event: { entity_id: <any-id> } } and
//   delete the TapeRuns belonging to an arbitrary project (or, with data_env,
//   in any environment they chose).
//
// New contract:
//   - require base44.auth.me() (any authenticated user — the trigger system
//     posts as a user context),
//   - server-side check: if the parent Project still exists, REFUSE the call.
//     Legitimate use is a cascade AFTER Project.delete (RLS owner-OR-admin),
//     so by the time this function fires the parent should be gone. If the
//     project is still present, this is misuse.
//   - data_env not trusted from body (see #22 — unified server-derive pattern
//     pending).

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !user.email) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try { body = await req.json(); } catch { body = {}; }
    const projectId = body?.event?.entity_id;
    if (!projectId) {
      return Response.json({ error: 'No entity_id in event' }, { status: 400 });
    }

    // Legitimacy gate: the parent Project must already be gone for this
    // cascade to be valid. If it still exists, the caller did not just delete
    // it (or is calling the cascade directly to mass-delete tape runs).
    const stillExists = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
    if (stillExists) {
      return Response.json(
        { error: 'Project still exists; cascadeDeleteTapeRuns is only valid after Project.delete' },
        { status: 409 },
      );
    }

    const runs = await base44.asServiceRole.entities.TapeRun.filter({ project_id: projectId });
    for (const run of runs) {
      await base44.asServiceRole.entities.TapeRun.delete(run.id);
    }

    return Response.json({ deleted: runs.length });
  } catch (error) {
    return Response.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
});
