import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// refreshSOSToken — admin-only manual rotation of the SOS access_token.
//
// Companion to getIntegrationConfigRedacted + updateIntegrationConfigSettings.
// The SOS sync functions (createSOSSalesOrder, reconcileSOSOrders, etc.)
// already refresh on 401 automatically — this exists for the case when an
// admin needs to manually mint a fresh token from the Settings UI without
// triggering a sync call. Useful for diagnostics + re-issuing after a
// stale/expired token state.
//
// SCOPE:
//   - Admin role required.
//   - Uses the stored refresh_token + client_id + client_secret on the
//     IntegrationConfig row to call SOS's OAuth refresh endpoint.
//   - Persists the new access_token, the new refresh_token (if SOS rotates
//     it), and updates token_expires_at.
//   - Returns the redacted shape — never the raw token.
//
// SECURITY:
//   - Refresh errors return a sanitized message (per #33 pattern). Never
//     surface raw SOS / OAuth response bodies to the caller — they can
//     contain internal IDs or error details that shouldn't leak.

const SOS_OAUTH_TOKEN_URL = 'https://api.sosinventory.com/oauth2/token';
const REDACTED_TOKEN_HINT_LENGTH = 4;
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

    // Load the SOS config row.
    const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
    if (!configs || configs.length === 0) {
      return err(404, 'not_found', 'No SOS IntegrationConfig saved yet');
    }
    const config = configs[0];

    // Required fields for refresh.
    if (!isNonEmptyString(config.refresh_token)) {
      return err(400, 'missing_field', 'refresh_token is not set');
    }
    if (!isNonEmptyString(config.client_id)) {
      return err(400, 'missing_field', 'client_id is not set');
    }
    if (!isNonEmptyString(config.client_secret)) {
      return err(400, 'missing_field', 'client_secret is not set');
    }

    const refreshToken = sanitizeToken(config.refresh_token);
    const clientId = sanitizeToken(config.client_id);
    const clientSecret = sanitizeToken(config.client_secret);

    // Call SOS OAuth refresh endpoint.
    let response: Response;
    try {
      response = await fetch(SOS_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
    } catch (fetchErr: any) {
      // Network failure. Don't leak the raw error message (could contain
      // outbound URL bits / DNS info). Generic.
      return err(502, 'upstream_unreachable', 'Could not reach SOS OAuth endpoint');
    }

    if (!response.ok) {
      // SOS rejected the refresh. Surface the HTTP status but NOT the body —
      // could contain internal error details or token-shaped data.
      return err(502, 'refresh_failed', `SOS OAuth refresh failed (HTTP ${response.status})`);
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      return err(502, 'refresh_failed', 'SOS OAuth response was not JSON');
    }

    const newAccessToken = json && typeof json.access_token === 'string' ? json.access_token : null;
    if (!newAccessToken) {
      return err(502, 'refresh_failed', 'SOS OAuth response missing access_token');
    }

    // Persist. Update only the fields the OAuth response gave us.
    const patch: Record<string, string> = {
      access_token: sanitizeToken(newAccessToken),
    };
    if (typeof json.refresh_token === 'string' && json.refresh_token.length > 0) {
      patch.refresh_token = sanitizeToken(json.refresh_token);
    }
    if (typeof json.expires_in === 'number' && Number.isFinite(json.expires_in) && json.expires_in > 0) {
      patch.token_expires_at = new Date(Date.now() + json.expires_in * 1000).toISOString();
    }

    const updated = await base44.asServiceRole.entities.IntegrationConfig.update(config.id, patch);

    return Response.json({ ok: true, config: redactedShape('SOS', updated) });
  } catch (error: any) {
    return err(500, 'internal', error?.message || 'Internal error');
  }
});
