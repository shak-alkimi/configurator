import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// writeTapeRunAsOwner — authenticated create/update/delete/reorder gateway for
// TapeRun records. Task #94 (Codex P0 from comprehensive audit 2026-05-24).
//
// Why this exists:
//   TapeRun.jsonc had no `rls` block, and Base44's default permits any
//   authenticated user to POST a TapeRun with arbitrary `project_id` (verified
//   exploit 2026-05-24: rep created a TapeRun with project_id="0000…0000",
//   status 200, full row returned). That means a malicious or buggy client
//   could attach runs to projects they don't own.
//
//   Mirrors the writeProjectAsOwner pattern (#91). TapeRun.create/update/delete
//   RLS is now admin-only at the entity level; legitimate rep writes flow
//   through this function which enforces parent-Project ownership before any
//   service-role mutation.
//
// Contract:
//   POST body: { op: 'create'|'update'|'delete'|'reorder', ...op-specific }
//   - create:  { op:'create', patch: <fields incl. project_id> }
//   - update:  { op:'update', runId: string, patch: <fields, NO project_id> }
//   - delete:  { op:'delete', runId: string }
//   - reorder: { op:'reorder', updates: [{ runId, order, driver_group? }] }
//              (batched because the configurator drag-reorder fires N updates)
//
//   Ownership rule applied in every op:
//     - For create: load Project(patch.project_id) via service-role, verify
//       created_by===user.email OR user.role==='admin'. Reject if neither.
//     - For update/delete/reorder: load each target TapeRun, then its parent
//       Project, then verify ownership. Reject on any single failure.
//
//   project_id is NOT writable on update (move-between-projects requires
//   delete+create with two ownership checks).
//   Unknown keys in patch hard-reject with 400.

const TAPERUN_WRITABLE_KEYS = new Set([
  'project_id',     // create only
  'run_name',
  'length_feet',
  'tape_output',
  'product_type',
  'location',
  'cct',
  'channel_type',
  'lens',
  'finish',
  'notes',
  'driver_group',
  'order',
]);

const TAPERUN_UPDATABLE_KEYS = new Set([...TAPERUN_WRITABLE_KEYS].filter(k => k !== 'project_id'));

const REORDER_MAX_ITEMS = 200; // generous; real configurators have <50

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

async function checkProjectOwnership(base44, projectId, user) {
  // Base44's Project.get(id) THROWS on missing. Catch and treat as not-found
  // so we return a clean 404 instead of bubbling to the outer 500 handler.
  const project = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
  if (!project) return { ok: false, status: 404, code: 'project_not_found', message: 'Parent project not found' };
  const isAdmin = user.role === 'admin';
  const isOwner = project.created_by && project.created_by === user.email;
  if (!isAdmin && !isOwner) {
    return { ok: false, status: 403, code: 'forbidden', message: 'Not authorized to modify TapeRuns for this project' };
  }
  return { ok: true, project };
}

function validatePatch(patch, allowed) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, message: 'patch must be an object' };
  }
  for (const k of Object.keys(patch)) {
    if (!allowed.has(k)) return { ok: false, message: `Field '${k}' is not writable on this path` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');

    let body;
    try { body = await req.json(); } catch { body = {}; }
    const { op } = body || {};

    // --- CREATE ---
    if (op === 'create') {
      const { patch } = body;
      const v = validatePatch(patch, TAPERUN_WRITABLE_KEYS);
      if (!v.ok) return err(400, 'invalid_patch', v.message);
      if (!patch.project_id) return err(400, 'bad_request', 'project_id required for create');
      if (typeof patch.length_feet !== 'number') return err(400, 'bad_request', 'length_feet (number) required for create');
      const own = await checkProjectOwnership(base44, patch.project_id, user);
      if (!own.ok) return err(own.status, own.code, own.message);
      const safe = { ...patch };
      delete safe.id;
      delete safe.created_by; // never trust body
      // PLATFORM LIMITATION (verified 2026-05-25): Base44's asServiceRole.create
      // stamps created_by = service identity ("service+...@no-reply.base44.com")
      // regardless of any value passed in the body. Per-record rep attribution
      // is therefore NOT recoverable on this entity via the gateway. Grep
      // confirms nothing in the codebase reads TapeRun.created_by today, so
      // this is cosmetic-only. If rep attribution becomes operationally
      // important (audit log, rep-filter UI), add a parallel custom field
      // (e.g. author_email) to the schema and set it here from user.email —
      // Base44 does not block custom-field writes via service role.
      const created = await base44.asServiceRole.entities.TapeRun.create(safe);
      return Response.json({ ok: true, tapeRun: created });
    }

    // --- UPDATE ---
    if (op === 'update') {
      const { runId, patch } = body;
      if (!runId) return err(400, 'bad_request', 'runId required for update');
      const v = validatePatch(patch, TAPERUN_UPDATABLE_KEYS);
      if (!v.ok) return err(400, 'invalid_patch', v.message);
      const existing = await base44.asServiceRole.entities.TapeRun.get(runId).catch(() => null);
      if (!existing) return err(404, 'not_found', 'TapeRun not found');
      const own = await checkProjectOwnership(base44, existing.project_id, user);
      if (!own.ok) return err(own.status, own.code, own.message);
      const safe = { ...patch };
      delete safe.id;
      delete safe.project_id;
      const updated = await base44.asServiceRole.entities.TapeRun.update(runId, safe);
      return Response.json({ ok: true, tapeRun: updated });
    }

    // --- DELETE ---
    if (op === 'delete') {
      const { runId } = body;
      if (!runId) return err(400, 'bad_request', 'runId required for delete');
      const existing = await base44.asServiceRole.entities.TapeRun.get(runId).catch(() => null);
      if (!existing) return err(404, 'not_found', 'TapeRun not found');
      const own = await checkProjectOwnership(base44, existing.project_id, user);
      if (!own.ok) return err(own.status, own.code, own.message);
      await base44.asServiceRole.entities.TapeRun.delete(runId);
      return Response.json({ ok: true });
    }

    // --- REORDER (batch update of order + driver_group only) ---
    if (op === 'reorder') {
      const { updates } = body;
      if (!Array.isArray(updates) || updates.length === 0) {
        return err(400, 'bad_request', 'updates must be a non-empty array');
      }
      if (updates.length > REORDER_MAX_ITEMS) {
        return err(400, 'bad_request', `updates exceeds max ${REORDER_MAX_ITEMS}`);
      }
      // Validate shape first (fail fast before any writes)
      for (const u of updates) {
        if (!u || !u.runId) return err(400, 'bad_request', 'each update must have runId');
        if (typeof u.order !== 'number') return err(400, 'bad_request', 'each update must have numeric order');
        if (u.driver_group !== undefined && typeof u.driver_group !== 'string') {
          return err(400, 'bad_request', 'driver_group must be a string when present');
        }
      }
      // Fetch all targets via service-role and verify ownership for EACH.
      // (Sequential because Base44 entity API doesn't expose a bulk get; this is
      // the existing per-op cost the previous client code already paid.)
      const projectOwnershipCache = new Map();
      for (const u of updates) {
        const existing = await base44.asServiceRole.entities.TapeRun.get(u.runId).catch(() => null);
        if (!existing) return err(404, 'not_found', `TapeRun ${u.runId} not found`);
        let own = projectOwnershipCache.get(existing.project_id);
        if (!own) {
          own = await checkProjectOwnership(base44, existing.project_id, user);
          projectOwnershipCache.set(existing.project_id, own);
        }
        if (!own.ok) return err(own.status, own.code, own.message);
      }
      // All checks passed — apply writes
      for (const u of updates) {
        const patch = { order: u.order };
        if (u.driver_group !== undefined) patch.driver_group = u.driver_group;
        await base44.asServiceRole.entities.TapeRun.update(u.runId, patch);
      }
      return Response.json({ ok: true, updated: updates.length });
    }

    return err(400, 'bad_request', "op must be one of 'create'|'update'|'delete'|'reorder'");
  } catch (error) {
    return err(500, 'internal', error?.message || 'Internal error');
  }
});
