// Shared SOS Inventory helpers used by both reconcileSOSOrders (scheduled
// background sweep) and fetchSOSOrderStatus (foreground refresh).
//
// Plain ES module so it imports cleanly in Deno. No JSX/TS syntax.

export const SOS_API_BASE = 'https://api.sosinventory.com/api/v2';
export const SOS_OAUTH_TOKEN_URL = 'https://api.sosinventory.com/oauth2/token';

// Strip whitespace + ASCII control chars from a token string.
// Tokens contain hyphens/underscores legitimately, so we keep those.
// Defensive against bracketed-paste escapes and trailing newlines that
// can leak in when an admin pastes credentials into the Settings form.
// eslint-disable-next-line no-control-regex
const sanitizeToken = (s) => (s || '').replace(/[\s\x00-\x1f\x7f]/g, '');

export async function loadSOSConfig(base44, data_env) {
  const configs = await base44.asServiceRole.entities.IntegrationConfig.filter(
    { service: 'SOS' }, undefined, undefined, undefined, data_env
  );
  const config = configs?.[0];
  if (!config) return null;
  // Return a sanitized clone so callers don't have to remember to clean
  // tokens themselves. We intentionally only sanitize the token fields
  // — other config fields (e.g. service, id) are passed through as-is.
  return {
    ...config,
    access_token: sanitizeToken(config.access_token),
    refresh_token: sanitizeToken(config.refresh_token),
    client_id: sanitizeToken(config.client_id),
    client_secret: sanitizeToken(config.client_secret),
  };
}

// Refresh an expired SOS access token using the stored refresh_token, persist
// both back to IntegrationConfig, and return the new access_token. Throws if
// the IntegrationConfig is missing the OAuth client credentials.
export async function refreshAccessToken(base44, config, data_env) {
  if (!config.refresh_token || !config.client_id || !config.client_secret) {
    throw new Error('Cannot refresh SOS token — missing refresh_token / client_id / client_secret in IntegrationConfig');
  }
  const response = await fetch(SOS_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token,
      client_id: config.client_id,
      client_secret: config.client_secret,
    }),
  });
  if (!response.ok) {
    throw new Error(`SOS token refresh failed: ${response.status}`);
  }
  const tokens = await response.json();
  await base44.asServiceRole.entities.IntegrationConfig.update(
    config.id,
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || config.refresh_token,
    },
    data_env
  );
  return tokens.access_token;
}

// Fetch a single SOS sales order with one auto-retry on 401 (refresh + retry).
// Caller passes a `getToken` closure so we always read the current token after
// refresh — avoids stale-token bugs across multiple calls in the same sweep.
export async function fetchSOSOrder(sosOrderId, getToken, onUnauthorized) {
  const url = `${SOS_API_BASE}/salesorder/${encodeURIComponent(sosOrderId)}`;
  const tryOnce = async () => fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } });

  let response = await tryOnce();
  if (response.status === 401) {
    await onUnauthorized();
    response = await tryOnce();
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SOS ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

// Map a SOS sales order to Project field updates. Only includes keys whose
// values actually differ — feeds the idempotency check upstream.
export function diffProjectAgainstSOS(project, sosOrder) {
  const next = {};
  const mapped = {
    sos_status: mapSOSStatus(sosOrder),
    tracking_number: extractTracking(sosOrder),
    status: mapToProjectStatus(sosOrder, project.status),
  };
  for (const [k, v] of Object.entries(mapped)) {
    if (v != null && v !== project[k]) next[k] = v;
  }
  return next;
}

// Adjust to match the real SOS payload shape once we capture a live response.
export function mapSOSStatus(sosOrder) {
  return sosOrder?.status || sosOrder?.statusDescription || null;
}

export function extractTracking(sosOrder) {
  return sosOrder?.trackingNumber
    || sosOrder?.shipment?.trackingNumber
    || sosOrder?.shipments?.[0]?.trackingNumber
    || null;
}

// Translate SOS lifecycle to our Project.status enum. Never downgrades —
// once 'shipped', polling can't accidentally revert it.
export function mapToProjectStatus(sosOrder, currentStatus) {
  const sosStatus = (sosOrder?.status || sosOrder?.statusDescription || '').toLowerCase();
  if (sosStatus.includes('shipped') || sosStatus.includes('closed')) return 'shipped';
  if (sosStatus.includes('approved') || sosStatus.includes('open')) {
    return currentStatus === 'shipped' ? currentStatus : 'approved';
  }
  return null;
}

// Convenience: apply a SOS state update to a single Project (used by both
// callers). Returns the diff that was written (empty object if no change).
export async function syncProjectFromSOS(base44, project, getToken, onUnauthorized, data_env) {
  const sosOrder = await fetchSOSOrder(project.sos_order_id, getToken, onUnauthorized);
  const updates = diffProjectAgainstSOS(project, sosOrder);
  if (Object.keys(updates).length > 0) {
    await base44.asServiceRole.entities.Project.update(
      project.id,
      { ...updates, last_sos_sync_at: new Date().toISOString(), last_sos_sync_error: '' },
      data_env
    );
  }
  return updates;
}
