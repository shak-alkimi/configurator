import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// getIntegrationConfigRedacted — admin-only READ for IntegrationConfig.
//
// Returns a REDACTED view of the saved OAuth credentials so the browser can
// render "Configured ✓ (•••f9a2)" without ever holding the actual token.
// Part of task #30 — closes the secret-leak surface where Settings.jsx was
// reading raw access_token / refresh_token / client_secret values via
// base44.entities.IntegrationConfig.filter() and storing them in React state.
//
// SCOPE:
//   READ-ONLY. Use updateIntegrationConfigSettings to write, refreshSOSToken
//   to manually rotate the access token. This function never mutates.
//
// AUDIT (AGENTS.md Alkimi-specific trigger): if any code path returns a raw
// access_token, refresh_token, or client_secret value from this function,
// it's a P0 finding. The redacted shape is locked: booleans + last4 hint +
// client_id (not a secret) + expiry + notes.

const REDACTED_TOKEN_HINT_LENGTH = 4;

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const { service } = body || {};
    if (!service || typeof service !== 'string') {
      return err(400, 'bad_request', 'service required (e.g. "SOS")');
    }

    // Load existing row via service-role; missing row is a valid state (not yet
    // configured) — return the redacted shape with all booleans false.
    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service });
    const config = configs && configs.length > 0 ? configs[0] : null;

    if (!config) {
      return Response.json({
        ok: true,
        config: {
          service,
          has_access_token: false,
          has_refresh_token: false,
          has_client_secret: false,
          client_id: null,
          access_token_last4: null,
          token_expires_at: null,
          notes: null,
        },
      });
    }

    return Response.json({
      ok: true,
      config: {
        service,
        has_access_token: isNonEmptyString(config.access_token),
        has_refresh_token: isNonEmptyString(config.refresh_token),
        has_client_secret: isNonEmptyString(config.client_secret),
        // client_id is the OAuth "username" half — not a secret; show full value
        // so the admin can verify they're connected to the right app/account.
        client_id: isNonEmptyString(config.client_id) ? config.client_id : null,
        access_token_last4: last4(config.access_token),
        token_expires_at: config.token_expires_at || null,
        notes: config.notes || null,
      },
    });
  } catch (error: any) {
    return err(500, 'internal', error?.message || 'Internal error');
  }
});
