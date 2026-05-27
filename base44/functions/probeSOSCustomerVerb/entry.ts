import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// probeSOSCustomerVerb — temporary spike for #42 pushCustomerEditToSOS.
//
// Read-mostly probe: figures out whether SOS expects PUT /customer/<id> or
// POST /customer with {id} in body for customer updates. Effectively a
// no-op write (sets `name` to its current value), but is technically still
// a write — admin-only, manually triggered.
//
// CONTRACT:
//   POST { sos_id: string }   (must be an existing SOS customer id)
//
// Returned shape (no secrets):
//   { ok: true, get_status, get_top_level_keys, put: {status, body_snippet},
//     post: {status, body_snippet} | null,
//     recommended_verb: 'PUT' | 'POST' | 'inconclusive' }
//
// DELETE THIS FUNCTION AFTER THE SPIKE (per #42 scope discipline).

const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';

function err(status, code, message) {
  return Response.json({ ok: false, code, error: message }, { status });
}

function sanitizeToken(raw) {
  return String(raw || '').replace(/[\s\x00-\x1F\x7F]/g, '');
}

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
  if (!res.ok) throw new Error(`Token refresh failed (HTTP ${res.status})`);
  const json = await res.json();
  const newToken = json.access_token;
  if (!newToken) throw new Error('Refresh response missing access_token');
  const patch = {
    access_token: newToken,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    ...(json.expires_in ? { token_expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString() } : {}),
  };
  await base44.asServiceRole.entities.IntegrationConfig.update(config.id, patch);
  config.access_token = newToken;
  if (json.refresh_token) config.refresh_token = json.refresh_token;
  if (json.expires_in) config.token_expires_at = patch.token_expires_at;
  return newToken;
}

async function callSOS(base44, config, method, path, bodyJson) {
  let token = sanitizeToken(config.access_token);
  const fire = async () => {
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(bodyJson ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(bodyJson ? { body: JSON.stringify(bodyJson) } : {}),
    };
    return fetch(`${SOS_API_BASE}${path}`, opts);
  };
  let response = await fire();
  if (response.status === 401) {
    token = await refreshAccessToken(base44, config);
    response = await fire();
  }
  const bodyText = await response.text();
  let parsedBody = null;
  try { parsedBody = JSON.parse(bodyText); } catch { /* leave null */ }
  return { status: response.status, bodyText, bodyJson: parsedBody };
}

// Return a short safe snippet of the SOS response body (NOT echoing tokens
// or other secrets — SOS responses don't carry tokens, but cap at 400 chars
// to keep the probe response readable).
function safeSnippet(text) {
  if (typeof text !== 'string') return null;
  return text.slice(0, 400);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || !user.email) return err(401, 'unauthorized', 'Unauthorized');
    if (user.role !== 'admin') return err(403, 'forbidden', 'Admin role required');

    let body = {};
    try { body = await req.json(); } catch { body = {}; }
    const sosId = body?.sos_id != null ? String(body.sos_id) : '';
    if (!sosId) return err(400, 'bad_request', 'sos_id required');

    const config = await loadSOSConfig(base44);
    if (!config || !config.access_token) {
      return err(400, 'integration_not_configured', 'SOS IntegrationConfig missing or has no access_token');
    }

    // 1. GET current customer — confirms connectivity + captures current
    // name so the PUT/POST is a true no-op.
    const getRes = await callSOS(base44, config, 'GET', `/customer/${encodeURIComponent(sosId)}`);
    const obj = getRes.bodyJson?.data ?? getRes.bodyJson;
    const topLevelKeys = obj && typeof obj === 'object' ? Object.keys(obj) : [];
    const currentName = obj?.name && typeof obj.name === 'string' ? obj.name : null;

    if (getRes.status !== 200 || !currentName) {
      return Response.json({
        ok: false,
        code: 'get_failed',
        get_status: getRes.status,
        get_body_snippet: safeSnippet(getRes.bodyText),
        get_top_level_keys: topLevelKeys,
      });
    }

    // No-op payload: set name to itself. Minimum data shape.
    const noopPayload = { name: currentName };

    // 2. Try PUT /customer/<id>
    const putRes = await callSOS(base44, config, 'PUT', `/customer/${encodeURIComponent(sosId)}`, noopPayload);
    const putOk = putRes.status >= 200 && putRes.status < 300;

    let postRes = null;
    let postOk = false;
    if (!putOk) {
      // 3. Fallback: POST /customer with {id} + name in body.
      postRes = await callSOS(base44, config, 'POST', '/customer', { id: Number(sosId), ...noopPayload });
      postOk = postRes.status >= 200 && postRes.status < 300;
    }

    let recommendedVerb = 'inconclusive';
    if (putOk) recommendedVerb = 'PUT';
    else if (postOk) recommendedVerb = 'POST';

    return Response.json({
      ok: true,
      get_status: getRes.status,
      get_top_level_keys: topLevelKeys,
      put: { status: putRes.status, body_snippet: safeSnippet(putRes.bodyText) },
      post: postRes ? { status: postRes.status, body_snippet: safeSnippet(postRes.bodyText) } : null,
      recommended_verb: recommendedVerb,
    });
  } catch (error) {
    return err(500, 'internal', 'Internal error during probe');
  }
});
