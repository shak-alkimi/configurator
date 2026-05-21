import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { loadSOSConfig, refreshAccessToken, syncProjectFromSOS } from '../../shared/sos.js';

// Foreground refresh: called from the rep portal when a project page mounts.
// Fetches current SOS state for one project, applies any deltas, and returns
// the updated project. Gives near-real-time updates when the rep is actively
// looking, complementing the background reconcile sweep.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, data_env } = await req.json();
    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }

    // Use the user's own RLS-scoped view so we don't leak projects across reps.
    const project = await base44.entities.Project.get(project_id, data_env);
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }
    if (!project.sos_order_id) {
      // Project hasn't been pushed to SOS yet — nothing to refresh.
      return Response.json({ project, updates: {} });
    }

    const config = await loadSOSConfig(base44, data_env);
    if (!config) {
      return Response.json({ error: 'SOS IntegrationConfig not found' }, { status: 400 });
    }

    let token = config.access_token;
    const getToken = () => token;
    const onUnauthorized = async () => { token = await refreshAccessToken(base44, config, data_env); };

    try {
      const updates = await syncProjectFromSOS(base44, project, getToken, onUnauthorized, data_env);
      const refreshed = Object.keys(updates).length > 0
        ? await base44.entities.Project.get(project_id, data_env)
        : project;
      return Response.json({ project: refreshed, updates });
    } catch (error) {
      await base44.asServiceRole.entities.Project.update(
        project.id,
        { last_sos_sync_at: new Date().toISOString(), last_sos_sync_error: error.message },
        data_env
      ).catch(() => {});
      return Response.json({ error: error.message }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
