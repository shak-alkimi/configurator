#!/usr/bin/env bash
# Quick SOS connectivity check from the command line.
#
# Usage A (arg):   bash scripts/sos-ping.sh <ACCESS_TOKEN>
# Usage B (file):  put the token on a single line in scripts/.sos-token
#                  then run:  bash scripts/sos-ping.sh
#
# Usage B avoids terminal-paste artifacts (bracketed-paste escapes,
# trailing newlines) corrupting the Authorization header.

set -u

raw=""
if [ $# -ge 1 ]; then
  raw="$1"
elif [ -f "scripts/.sos-token" ]; then
  raw="$(cat scripts/.sos-token)"
else
  echo "Usage: bash scripts/sos-ping.sh <ACCESS_TOKEN>" >&2
  echo "   or: put the token in scripts/.sos-token and run with no args" >&2
  exit 2
fi

# Strip ALL whitespace (spaces, tabs, newlines, carriage returns) AND
# the bracketed-paste escape wrappers some terminals inject around
# pasted text (ESC[200~ ... ESC[201~).
clean=$(printf '%s' "$raw" \
  | tr -d '[:space:]' \
  | sed -e 's/\x1b\[200~//g' -e 's/\x1b\[201~//g')

len=${#clean}
first8="${clean:0:8}"
last8="${clean: -8}"

echo "Token diagnostics:"
echo "  cleaned length: $len"
echo "  starts with:    $first8…"
echo "  ends with:      …$last8"
echo

URL="https://api.sosinventory.com/api/v2/customer?max=1"
echo "GET $URL"
echo "----------"
curl -sS -i -H "Authorization: Bearer $clean" "$URL" | head -n 20
echo
echo "----------"
echo "(showing first 20 lines of response)"
