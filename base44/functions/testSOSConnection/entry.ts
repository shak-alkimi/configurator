import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { SOS_API_BASE, loadSOSConfig, refreshAccessToken } from '../../shared/sos.js';

// Admin-only round-trip check: loads the saved SOS IntegrationConfig and
// performs a lightweight GET against the SOS API. If the access_token is
// expired we transparently refresh once and retry. Returns shape:
//   { ok: true,  status, sample? }
//   { ok: false, status, error }
// so the Settings page can render a clear success/failure toast without
// the admin having to dispatch a real sales order to verify creds.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Admin role required' }, { status: 403 });
    }

    const { data_env } = await safeJson(req);

    const config = await loadSOSConfig(base44, data_env);
    if (!config) {
      return Response.json({ ok: false, error: 'No SOS IntegrationConfig saved yet' }, { status: 400 });
    }
    if (!config.access_token) {
      return Response.json({ ok: false, error: 'Missing access_token in IntegrationConfig' }, { status: 400 });
    }

    let token = config.access_token;
    const ping = async () => fetch(`${SOS_API_BASE}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    let response = await ping();
    if (response.status === 401) {
      try {
        token = await refreshAccessToken(base44, config, data_env);
      } catch (refreshErr) {
        return Response.json(
          { ok: false, status: 401, error: `Token expired and refresh failed: ${refreshErr.message}` },
          { status: 200 },
        );
      }
      response = await ping();
    }

    if (!response.ok) {
      const body = await response.text();
      return Response.json(
        { ok: false, status: response.status, error: body.slice(0, 300) || 'SOS returned non-2xx' },
        { status: 200 },
      );
    }

    // Parse defensively — SOS sometimes wraps payloads in { data: ... }.
    let sample: unknown = null;
    try {
      const json = await response.json();
      sample = json?.data ?? json ?? null;
    } catch {
      // Non-JSON 2xx is still a positive signal — connection works.
    }

    return Response.json({ ok: true, status: response.status, sample });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

async function safeJson(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
