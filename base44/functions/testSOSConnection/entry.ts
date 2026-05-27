import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Admin-only round-trip check: loads the saved SOS IntegrationConfig and
// performs a lightweight GET against the SOS API. If the access_token is
// expired we transparently refresh once and retry. Returns shape:
//   { ok: true,  status, sample? }
//   { ok: false, status, error }

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';

async function loadSOSConfig(base44) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter({ service: 'SOS' });
  return configs?.[0] ?? null;
}

async function refreshAccessToken(base44, config) {
  const res = await fetch('https://api.sosinventory.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token || '',
      client_id: config.client_id || '',
      client_secret: config.client_secret || '',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const newToken = json.access_token;
  if (!newToken) throw new Error('Refresh response missing access_token');
  const patch = {
    access_token: newToken,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    ...(json.expires_in ? { token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString() } : {}),
  };
  await base44.asServiceRole.entities.IntegrationConfig.update(config.id, patch);
  // P1 fix from #112 (Codex audit of #41): mutate `config` in place so
  // subsequent callSOS invocations read the fresh token. Without this, a
  // multi-call SOS session that triggers a 401 would re-read the stale
  // access_token from `config` on the next call, and — if SOS rotated the
  // refresh_token — fail outright on the next 401.
  config.access_token = newToken;
  if (json.refresh_token) config.refresh_token = json.refresh_token;
  if (json.expires_in) config.token_expires_at = patch.token_expires_at;
  return newToken;
}

function sanitizeToken(raw) {
  // Drop whitespace and ASCII control chars; tokens are URL-safe base64-ish
  // and never contain those legitimately.
  return (raw || '').replace(/[\s\u0000-\u001F\u007F]/g, '');
}

async function safeJson(req) {
  try { return await req.json(); } catch { return {}; }
}

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

    await safeJson(req); // consume body (data_env not needed here)

    const config = await loadSOSConfig(base44);
    if (!config) {
      return Response.json({ ok: false, error: 'No SOS IntegrationConfig saved yet' }, { status: 400 });
    }
    if (!config.access_token) {
      return Response.json({ ok: false, error: 'Missing access_token in IntegrationConfig' }, { status: 400 });
    }

    let token = sanitizeToken(config.access_token);

    const ping = async () => fetch(`${SOS_API_BASE}/customer?max=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    let response = await ping();
    if (response.status === 401) {
      try {
        token = await refreshAccessToken(base44, config);
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

    let sample = null;
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