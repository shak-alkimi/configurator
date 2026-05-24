#!/usr/bin/env bash
# Run an independent Codex audit of recent work.
#
# Workflow design (see memory:alkimi-audit-workflow):
#   Claude Code implements. Codex audits. Two separate AIs so review is
#   independent of the implementer. Findings flow back into the task list
#   as P0/P1/P2 items; this script never edits code.
#
# Usage:
#   bash scripts/audit.sh                # audit since last "Stamp baseline" commit
#   bash scripts/audit.sh <BASE>         # audit since given ref (sha, tag, branch)
#   bash scripts/audit.sh --commit <SHA> # audit just one commit
#
# Requires: codex CLI installed (`npm i -g @openai/codex`) and authed
# (`codex login`; ChatGPT subscription works, no API key needed).

set -u

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not installed. Run: npm i -g @openai/codex" >&2
  exit 127
fi

# Single-commit mode
if [ "${1:-}" = "--commit" ]; then
  if [ -z "${2:-}" ]; then
    echo "Usage: bash scripts/audit.sh --commit <SHA>" >&2
    exit 2
  fi
  exec codex review --commit "$2" \
    "Audit the change in this commit. Apply: auth gaps, client-trusted inputs,
data-loss risk, schema/field mismatches, drift sources, OAuth refresh correctness,
idempotency, secret handling. Report findings as P0/P1/P2 with file:line citations.
Be specific. Skip findings that are stylistic-only unless they hide a bug."
fi

# Default: find the most recent "Stamp baseline" commit and audit everything since
if [ -n "${1:-}" ]; then
  BASE="$1"
else
  BASE=$(git log --grep='Stamp .* as baseline\|Stamp baseline' --format=%H | sed -n '2p')
  if [ -z "$BASE" ]; then
    BASE=$(git log --format=%H | tail -n 1)
    echo "WARN: no 'Stamp baseline' commit found in history. Auditing from the first commit." >&2
  fi
fi

SHORT=$(git rev-parse --short "$BASE")
echo "Audit base: $SHORT ($(git log -1 --format='%s' "$BASE"))"
echo "Audit head: $(git rev-parse --short HEAD) ($(git log -1 --format='%s'))"
echo "Files changed since base:"
git diff --name-only "$BASE"..HEAD | sed 's/^/  /'
echo "----------"

exec codex review --base "$BASE" \
  "Audit all changes between the base and HEAD. Apply this lens: auth gaps,
client-trusted inputs (data_env, project_id, anything else from request body),
data-loss risk, schema/field mismatches, drift between source-of-truth and copies,
OAuth refresh correctness, idempotency on writes, secret handling, error paths
that swallow data, missing input validation. Report findings as P0/P1/P2 with
file:line citations. Be specific and concrete. Skip stylistic-only findings unless
they hide a bug. If you cannot find issues in a file, say so explicitly rather
than padding the report."
