import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// writeProjectAsOwner — authenticated create/update gateway for Project records
// when Project.create/update RLS is admin-only. Task #91 (Codex P0 from Phase 1).
//
// Why this exists:
//   After task #32 added 11 SOS-owned + sync-metadata fields to Project, the
//   prior owner-can-write-anything RLS let a rep silently mutate sos_order_id,
//   sos_status, tracking_number, etc. — defeating #43's idempotency guard and
//   creating SOS-vs-Opus divergence. Base44 RLS is operation-scoped (no per-
//   field rules — confirmed via list_entity_schemas across all 7 live entities),
//   so the only durable boundary is to lock Project.create/update to admin and
//   route legitimate rep writes through this function with a strict allowlist.
//
// Contract:
//   POST body: { op: 'create' | 'update', projectId?: string, patch: object, data_env?: string }
//   - op 'update' requires projectId; op 'create' must NOT include projectId.
//   - patch may contain ONLY allowlisted Opus-owned keys for the chosen op.
//   - status values are value-restricted: only {draft, submitted, approved}.
//     Reps/admins cannot set in_fulfillment or shipped via this path — those
//     are SOS-driven via reconcileSOSOrders / fetchSOSOrderStatus.
//   - Unknown or disallowed keys reject with 400 (hard reject, not silent drop —
//     per Codex pass 2 caution: silent drop hides bugs and policy violations).
//   - drivers is structure-validated (max 50 entries, bounded numerics, known keys).
//   - quote_number allowed only on create (#26 compat — leaves the open task open
//     without blocking #91; on update we reject so reps can't rename quotes).
//   - share_token is NEVER client-writable here. Server-generation lives in the
//     dedicated share function once #alkimi-share-link-pending lands.
//   - created_by is server-set from auth context on create. Never trusted from body.
//   - On update, the existing project is fetched via service role and ownership
//     verified (created_by === user.email OR user.role === 'admin') BEFORE mutate.
//   - data_env is NOT accepted from the request body (Codex P0 follow-up to #91,
//     same pattern as #14/#22). Service-role calls run in Base44's default env.
//     Once #22 establishes a server-derive-from-request pattern for env routing,
//     wire that in here too.
//
// Response:
//   200 { ok: true, project: <record> }
//   400 { ok: false, error, code: 'bad_request' | 'disallowed_key' | 'disallowed_status' | 'invalid_drivers' | 'invalid_field' }
//   401 { ok: false, error: 'Unauthorized', code: 'unauthorized' }
//   403 { ok: false, error, code: 'forbidden' }
//   404 { ok: false, error: 'Project not found', code: 'not_found' }
//   500 { ok: false, error, code: 'internal' }

// Allowlists are deliberately explicit constants (mirrored in Project.jsonc
// header comment per the Customer.jsonc ownership-table durability pattern).
// Any new Opus-owned field added to Project must also be added here.
const OPUS_OWNED_UPDATE_KEYS = new Set([
  'project_name',
  'customer_name',
  'customer_email',
  'customer_phone',
  'street',
  'city',
  'state',
  'sector',
  'notes',
  'status',
  'drivers',
  'opus_customer_id',
]);

// Create accepts everything update accepts PLUS quote_number (one-time set on
// create; rewrites blocked on update per #26 compat note above).
const OPUS_OWNED_CREATE_KEYS = new Set([
  ...OPUS_OWNED_UPDATE_KEYS,
  'quote_number',
]);

// Admin-only subset of OPUS_OWNED_*_KEYS (per #115). These keys appear in the
// allowlist (so 'disallowed_key' doesn't fire), but a separate per-key gate
// rejects rep writes with 403. Rationale: deterministic Project↔Customer
// linkage must not be set by reps before the rep-picker policy lands in #116.
// Pattern is extensible — future admin-only Opus-owned fields just go here.
const ADMIN_ONLY_OPUS_OWNED_KEYS = new Set([
  'opus_customer_id',
]);

const ALLOWED_STATUS_VALUES = new Set(['draft', 'submitted', 'approved']);

// Drivers structure caps. Real configurator projects have <10 drivers in the
// wild; 50 is generous slack. maxWatts bounded against absurd values so the
// service-role write can't be used to plant garbage that breaks downstream
// pricing math.
const DRIVERS_MAX_LENGTH = 50;
const DRIVER_ALLOWED_KEYS = new Set(['id', 'name', 'maxWatts']);
const DRIVER_NAME_MAX = 100;
const DRIVER_ID_MAX = 100;
const DRIVER_MAX_WATTS_CAP = 10000;

function validateDrivers(drivers) {
  if (drivers === undefined || drivers === null) return { ok: true };
  if (!Array.isArray(drivers)) {
    return { ok: false, reason: 'drivers must be an array' };
  }
  if (drivers.length > DRIVERS_MAX_LENGTH) {
    return { ok: false, reason: `drivers exceeds max length ${DRIVERS_MAX_LENGTH}` };
  }
  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    if (!d || typeof d !== 'object' || Array.isArray(d)) {
      return { ok: false, reason: `drivers[${i}] must be an object` };
    }
    for (const k of Object.keys(d)) {
      if (!DRIVER_ALLOWED_KEYS.has(k)) {
        return { ok: false, reason: `drivers[${i}] has disallowed key '${k}'` };
      }
    }
    if (d.id !== undefined && (typeof d.id !== 'string' || d.id.length > DRIVER_ID_MAX)) {
      return { ok: false, reason: `drivers[${i}].id must be string <= ${DRIVER_ID_MAX} chars` };
    }
    if (d.name !== undefined && (typeof d.name !== 'string' || d.name.length > DRIVER_NAME_MAX)) {
      return { ok: false, reason: `drivers[${i}].name must be string <= ${DRIVER_NAME_MAX} chars` };
    }
    if (d.maxWatts !== undefined) {
      if (typeof d.maxWatts !== 'number' || !Number.isFinite(d.maxWatts) || d.maxWatts < 0 || d.maxWatts > DRIVER_MAX_WATTS_CAP) {
        return { ok: false, reason: `drivers[${i}].maxWatts must be a finite number 0..${DRIVER_MAX_WATTS_CAP}` };
      }
    }
  }
  return { ok: true };
}

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !user.email) {
      return err(401, 'unauthorized', 'Unauthorized');
    }

    let body;
    try { body = await req.json(); } catch { body = {}; }
    const { op, projectId, patch } = body || {};
    // data_env intentionally NOT destructured — client-controlled env routing
    // is a P0 in this codebase (see header comment + tasks #14/#22).

    if (op !== 'create' && op !== 'update') {
      return err(400, 'bad_request', "op must be 'create' or 'update'");
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return err(400, 'bad_request', 'patch must be an object');
    }
    if (op === 'update' && !projectId) {
      return err(400, 'bad_request', 'projectId required for op=update');
    }
    if (op === 'create' && projectId) {
      return err(400, 'bad_request', 'projectId must not be set for op=create');
    }

    // --- Allowlist enforcement (hard reject on unknown keys; Codex pass 2) ---
    const allowed = op === 'create' ? OPUS_OWNED_CREATE_KEYS : OPUS_OWNED_UPDATE_KEYS;
    for (const key of Object.keys(patch)) {
      if (!allowed.has(key)) {
        return err(400, 'disallowed_key',
          `Field '${key}' is not writable by this path. SOS-owned, sync-metadata, and lifecycle fields are managed by sync code only.`);
      }
    }

    // --- Admin-only key gate (#115) ---
    // Computed once and reused below for the update-path ownership check.
    const isAdmin = user.role === 'admin';
    for (const key of Object.keys(patch)) {
      if (ADMIN_ONLY_OPUS_OWNED_KEYS.has(key) && !isAdmin) {
        return err(403, 'forbidden',
          `Field '${key}' is admin-only. Rep picker policy is deferred to #116.`);
      }
    }

    // --- opus_customer_id existence validation (#115) ---
    // If admin sets opus_customer_id to a non-empty value, the referenced
    // Customer must exist. Empty/null clears the linkage (admin can un-link).
    // Customer.get() works under asServiceRole regardless of RLS — no Customer
    // RLS expansion required for this validation.
    if ('opus_customer_id' in patch) {
      const v = patch.opus_customer_id;
      if (v !== null && v !== undefined && v !== '') {
        if (typeof v !== 'string') {
          return err(400, 'invalid_field', 'opus_customer_id must be a string');
        }
        const customer = await base44.asServiceRole.entities.Customer.get(v).catch(() => null);
        if (!customer) {
          return err(400, 'invalid_field',
            `opus_customer_id references unknown Customer '${v}'`);
        }
      }
    }

    // status value restriction (only Opus-driven statuses)
    if (patch.status !== undefined && !ALLOWED_STATUS_VALUES.has(patch.status)) {
      return err(400, 'disallowed_status',
        `status '${patch.status}' is not settable here. in_fulfillment and shipped are SOS-driven via reconcileSOSOrders.`);
    }

    // --- #116 linkage gate ---
    // Reject status transitions to 'submitted' or 'approved' when the
    // resulting project would have an empty opus_customer_id. Applies to
    // BOTH rep and admin paths (defense in depth — pre-blocks #43 push
    // from inheriting unlinked state). For 'update' op, we must read the
    // existing row to know the linkage if the patch doesn't carry it.
    // For 'create' op, we only check the patch (no existing row).
    // Note: 'draft' is the unguarded state; admin can unlink at any time
    // — the gate fires the next time they try to move past draft.
    if (patch.status === 'submitted' || patch.status === 'approved') {
      let effectiveOpusCustomerId = null;
      if ('opus_customer_id' in patch) {
        effectiveOpusCustomerId = patch.opus_customer_id;
      } else if (op === 'update') {
        // Read existing — we need to know if the row is already linked.
        // Project.get throws on missing; treat that as no-link to surface
        // a clean 400 rather than crashing.
        const existing = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
        effectiveOpusCustomerId = existing?.opus_customer_id || null;
      }
      const linked = typeof effectiveOpusCustomerId === 'string' && effectiveOpusCustomerId.trim() !== '';
      if (!linked) {
        return err(400, 'requires_customer_linkage',
          `Cannot set status='${patch.status}' on a Project without opus_customer_id. ` +
          `An admin must link a Customer record first.`);
      }
    }

    // drivers structure validation
    const dv = validateDrivers(patch.drivers);
    if (!dv.ok) {
      return err(400, 'invalid_drivers', dv.reason);
    }

    // Reject explicit nulls/undefined-only patches to avoid no-op service-role writes
    if (Object.keys(patch).length === 0) {
      return err(400, 'bad_request', 'patch is empty');
    }

    // --- UPDATE path ---
    if (op === 'update') {
      // Base44's Project.get(id) THROWS on missing; catch so we return 404
      // instead of bubbling to the outer 500 handler.
      const existing = await base44.asServiceRole.entities.Project.get(projectId).catch(() => null);
      if (!existing) {
        return err(404, 'not_found', 'Project not found');
      }
      // isAdmin already computed above for the admin-only key gate (#115).
      const isOwner = existing.created_by && existing.created_by === user.email;
      if (!isAdmin && !isOwner) {
        return err(403, 'forbidden', 'Not authorized to modify this project');
      }
      // Defensive: never let body set created_by; never echo from existing into patch.
      const safePatch = { ...patch };
      delete safePatch.created_by;
      delete safePatch.id;

      const updated = await base44.asServiceRole.entities.Project.update(projectId, safePatch);
      return Response.json({ ok: true, project: updated });
    }

    // --- CREATE path ---
    // created_by is server-set from auth; never trust body.
    // Default status to 'draft' if omitted (mirrors current Calculator.jsx behavior).
    const createPayload = {
      ...patch,
      created_by: user.email,
    };
    if (createPayload.status === undefined) createPayload.status = 'draft';
    // Re-check status because we may have inserted a default
    if (!ALLOWED_STATUS_VALUES.has(createPayload.status)) {
      return err(400, 'disallowed_status', `status '${createPayload.status}' not allowed on create`);
    }
    // Strip id if a client tried to set it
    delete createPayload.id;

    const created = await base44.asServiceRole.entities.Project.create(createPayload);
    return Response.json({ ok: true, project: created });
  } catch (error) {
    // Surface the message but mark it internal so callers don't conflate it with
    // a policy rejection. Avoid leaking SOS/IntegrationConfig data — this function
    // doesn't touch those, so message exposure is bounded by Base44 SDK errors.
    return err(500, 'internal', error?.message || 'Internal error');
  }
});
