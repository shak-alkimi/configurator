import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// updateIntegrationConfigSettings — admin-only WRITE for IntegrationConfig.
//
// Replaces the prior pattern where Settings.jsx wrote raw secrets via
// base44.entities.IntegrationConfig.update/create directly from the browser.
// Now tokens travel one direction only (browser -> server) and never come
// back. The response is always the redacted shape from
// getIntegrationConfigRedacted so the browser can re-render with confirmation.
//
// SCOPE:
//   - Updates ONLY fields present in `updates` (independently optional).
//   - Empty string clears a field. Absent leaves it unchanged. null is also
//     treated as "clear" (defensive).
//   - Sanitizes incoming tokens (drop whitespace + ASCII control chars),
//     mirroring the sanitizeToken pattern from the SOS sync functions.
//   - Creates the row if it doesn't exist yet.
//   - Returns the redacted shape; never echoes raw values.
//
// AUDIT TRIGGER: this function MUST NOT return any of {access_token,
// refresh_token, client_secret} as raw values in any code path. Returning
// raw secrets, even briefly, is a P0 finding. Verify before merging.

// Allowlist of fields that can be touched via this function. Locked.
const ALLOWED_UPDATE_KEYS = new Set([
  'access_token',
  'refresh_token',
  'client_id',
  'client_secret',
  'notes',
]);

const REDACTED_TOKEN_HINT_LENGTH = 4;
const NOTES_MAX_LENGTH = 2000;
const TOKEN_MAX_LENGTH = 8192;
const CLIENT_ID_MAX_LENGTH = 256;

// Whitespace + ASCII control chars (0x00..0x1F + 0x7F). Built from a string
// pattern at runtime so the Write tool can't strip the unicode escapes when
// reading/writing this source file.
const TOKEN_NOISE_RE = new RegExp('[\\s\\x00-\\x1F\\x7F]', 'g');

function err(status: number, code: string, message: string) {
  return Response.json({ ok: false, code, error: message }, { status });
}

function last4(s: string | null | undefined): string | null {
  if (!s || typeof s !== 'string' || s.length < REDACTED_TOKEN_HINT_LENGTH) return null;
  return '...' + s.slice(-REDACTED_TOKEN_HINT_LENGTH);
}

function isNonEmptyString(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0;
}

function sanitizeToken(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(TOKEN_NOISE_RE, '');
}

function redactedShape(service: string, config: any) {
  return {
    service,
    has_access_token: isNonEmptyString(config?.access_token),
    has_refresh_token: isNonEmptyString(config?.refresh_token),
    has_client_secret: isNonEmptyString(config?.client_secret),
    has_client_id: isNonEmptyString(config?.client_id),
    client_id: isNonEmptyString(config?.client_id) ? config.client_id : null,
    access_token_last4: last4(config?.access_token),
    token_expires_at: config?.token_expires_at || null,
    notes: config?.notes || null,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const { service, updates } = body || {};

    if (!service || typeof service !== 'string') {
      return err(400, 'bad_request', 'service required (e.g. "SOS")');
    }
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return err(400, 'bad_request', 'updates must be an object');
    }

    // Hard-reject unknown keys (no silent drop — same pattern as
    // writeProjectAsOwner / writeTapeRunAsOwner per Codex pass 2).
    for (const key of Object.keys(updates)) {
      if (!ALLOWED_UPDATE_KEYS.has(key)) {
        return err(400, 'disallowed_key',
          `Field '${key}' is not writable. Allowed: ${[...ALLOWED_UPDATE_KEYS].join(', ')}`);
      }
    }

    if (Object.keys(updates).length === 0) {
      return err(400, 'bad_request', 'updates is empty');
    }

    // Build the patch. Each field independently:
    //   - null or empty string => clear (set to '')
    //   - non-empty string => sanitize + length-check + set
    //   - absent => leave unchanged (don't include in patch)
    const patch: Record<string, string> = {};

    for (const key of ['access_token', 'refresh_token', 'client_secret']) {
      if (key in updates) {
        const raw = updates[key];
        if (raw === null || raw === '') {
          patch[key] = '';
        } else {
          const sanitized = sanitizeToken(raw);
          if (sanitized.length > TOKEN_MAX_LENGTH) {
            return err(400, 'invalid_field', `${key} exceeds max length ${TOKEN_MAX_LENGTH}`);
          }
          patch[key] = sanitized;
        }
      }
    }

    if ('client_id' in updates) {
      const raw = updates.client_id;
      if (raw === null || raw === '') {
        patch.client_id = '';
      } else if (typeof raw !== 'string') {
        return err(400, 'invalid_field', 'client_id must be a string');
      } else {
        const trimmed = raw.trim();
        if (trimmed.length > CLIENT_ID_MAX_LENGTH) {
          return err(400, 'invalid_field', `client_id exceeds max length ${CLIENT_ID_MAX_LENGTH}`);
        }
        patch.client_id = trimmed;
      }
    }

    if ('notes' in updates) {
      const raw = updates.notes;
      if (raw === null || raw === '') {
        patch.notes = '';
      } else if (typeof raw !== 'string') {
        return err(400, 'invalid_field', 'notes must be a string');
      } else if (raw.length > NOTES_MAX_LENGTH) {
        return err(400, 'invalid_field', `notes exceeds max length ${NOTES_MAX_LENGTH}`);
      } else {
        patch.notes = raw;
      }
    }

    // Load existing row, create if absent.
    const existing = await base44.asServiceRole.entities.IntegrationConfig.filter({ service });
    let result: any;
    if (existing && existing.length > 0) {
      result = await base44.asServiceRole.entities.IntegrationConfig.update(existing[0].id, patch);
    } else {
      result = await base44.asServiceRole.entities.IntegrationConfig.create({ service, ...patch });
    }

    return Response.json({ ok: true, config: redactedShape(service, result) });
  } catch (error: any) {
    // Generic error — never leak token-shaped data even in the error path.
    return err(500, 'internal', error?.message || 'Internal error');
  }
});
