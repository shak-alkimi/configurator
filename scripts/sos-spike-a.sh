#!/usr/bin/env bash
# Spike A: empirical discovery of SOS Inventory API capabilities for the 5
# endpoints we plan to sync. Reads token from scripts/.sos-token.
#
# Output: per-endpoint markdown table written to scripts/.sos-spike-a-findings.md
# Usage: bash scripts/sos-spike-a.sh

set -u

TOKEN=$(tr -d '[:space:]' < scripts/.sos-token)
BASE="https://api.sosinventory.com/api/v2"
OUT="scripts/.sos-spike-a-findings.md"

call() {
  local path="$1"
  local label="${2:-}"
  # -i = include headers; -s = silent; -S = show errors; -m 30 = max 30s
  curl -sS -i -m 30 -H "Authorization: Bearer $TOKEN" "$BASE/$path" 2>&1
}

# Strip a response to "status line + key headers + first 600 bytes of body"
trim() {
  awk '
    BEGIN { in_body=0; body_len=0 }
    !in_body && /^$/ { in_body=1; print ""; next }
    !in_body { if ($0 ~ /^(HTTP|Content-Type|X-RateLimit|Retry-After|X-AspNet|Server|Date):/) print; next }
    in_body { body_len += length($0)+1; if (body_len < 600) print; else if (body_len < 700) print "..."; }
  '
}

probe() {
  local label="$1"
  local path="$2"
  echo "===== $label ====="
  call "$path" | trim
  echo
}

mkdir -p "$(dirname "$OUT")"
exec > "$OUT" 2>&1

echo "# Spike A: SOS API capability discovery"
echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ) by scripts/sos-spike-a.sh"
echo "Base URL: $BASE"
echo

for endpoint in customer estimate salesorder invoice salesreceipt; do
  echo "## /$endpoint"
  echo

  echo "### 1. Endpoint exists + response shape (max=2)"
  probe "GET $endpoint?max=2" "$endpoint?max=2"

  echo "### 2. Pagination param discovery (try page= / start= / offset=)"
  probe "GET $endpoint?max=2&page=2" "$endpoint?max=2&page=2"
  probe "GET $endpoint?max=2&start=2" "$endpoint?max=2&start=2"
  probe "GET $endpoint?max=2&offset=2" "$endpoint?max=2&offset=2"

  echo "### 3. updatedSince support (try ISO formats)"
  probe "GET $endpoint?max=2&updatedSince=2020-01-01" "$endpoint?max=2&updatedSince=2020-01-01"
  probe "GET $endpoint?max=2&updatedSince=2020-01-01T00:00:00Z" "$endpoint?max=2&updatedSince=2020-01-01T00:00:00Z"

  echo "### 4. Alternative cursor names"
  probe "GET $endpoint?max=2&lastModified=2020-01-01" "$endpoint?max=2&lastModified=2020-01-01"
  probe "GET $endpoint?max=2&modifiedSince=2020-01-01" "$endpoint?max=2&modifiedSince=2020-01-01"
  probe "GET $endpoint?max=2&since=2020-01-01" "$endpoint?max=2&since=2020-01-01"

  echo "---"
  echo
done

echo "## Rate-limit headers check"
echo "(rapid back-to-back calls — looking for X-RateLimit-* or Retry-After)"
echo
for i in 1 2 3 4 5; do
  echo "### Call $i"
  call "customer?max=1" | trim
  echo
done
