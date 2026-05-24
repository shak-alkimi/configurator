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
#   bash scripts/audit.sh --any-branch … # bypass the on-main safety check
#
# Requires: codex CLI installed (`npm i -g @openai/codex`) and authed
# (`codex login`; ChatGPT subscription works, no API key needed).

set -u

if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex CLI not installed. Run: npm i -g @openai/codex" >&2
  exit 127
fi

# --- Branch safety check ---------------------------------------------------
# Codex previously audited stale code because it was reviewing
# `codex-sync-baseline` while the real work lived on `main`. Refuse to run
# unless we're on `main` AND up-to-date with origin, unless the caller
# passes --any-branch first. This is the single biggest failure mode for
# this workflow; the guard pays for itself the first time it fires.
ALLOW_ANY_BRANCH="no"
if [ "${1:-}" = "--any-branch" ]; then
  ALLOW_ANY_BRANCH="yes"
  shift
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
HEAD_SHA=$(git rev-parse HEAD)
HEAD_SHORT=$(git rev-parse --short HEAD)

if ! git cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
  echo "ERROR: HEAD commit $HEAD_SHA is not resolvable. Repo state is broken." >&2
  exit 6
fi

if [ "$ALLOW_ANY_BRANCH" = "no" ] && [ "$BRANCH" != "main" ]; then
  echo "ERROR: not on main (currently on '$BRANCH')." >&2
  echo "Codex audits the checked-out tree; auditing a feature branch" >&2
  echo "while the work has landed on main produces stale findings." >&2
  echo "Either: (a) git checkout main && git pull, or (b) re-run with" >&2
  echo "    bash scripts/audit.sh --any-branch [args]" >&2
  exit 3
fi

# Fetch latest so the up-to-date check below is meaningful. Skip if no
# remote (e.g. detached test env).
if git remote get-url origin >/dev/null 2>&1; then
  git fetch --quiet origin "$BRANCH" 2>/dev/null || true
  LOCAL=$HEAD_SHA
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")
  if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
    AHEAD=$(git rev-list --count "$REMOTE..$LOCAL" 2>/dev/null || echo "?")
    BEHIND=$(git rev-list --count "$LOCAL..$REMOTE" 2>/dev/null || echo "?")
    echo "WARN: local $BRANCH differs from origin/$BRANCH (ahead $AHEAD, behind $BEHIND)." >&2
    echo "Codex will audit your local tree, which may not match what's pushed." >&2
  fi
fi

# Refuse to run with dirty working tree — Codex's review of HEAD won't
# include uncommitted changes, and you'd be auditing a snapshot you can't
# point at by SHA later.
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: working tree has uncommitted changes." >&2
  echo "Commit or stash before auditing, so the audit corresponds to a SHA." >&2
  git status --short >&2
  exit 4
fi

# --- Single-commit mode ----------------------------------------------------
if [ "${1:-}" = "--commit" ]; then
  if [ -z "${2:-}" ]; then
    echo "Usage: bash scripts/audit.sh --commit <SHA>" >&2
    exit 2
  fi
  COMMIT_SHA=$2
  COMMIT_SHORT=$(git rev-parse --short "$COMMIT_SHA")
  COMMIT_MSG=$(git log -1 --format='%s' "$COMMIT_SHA")
  echo "Branch:        $BRANCH"
  echo "Audit target:  commit $COMMIT_SHORT ($COMMIT_MSG)"
  echo "Repo HEAD:     $HEAD_SHORT"
  echo "----------"
  exec codex review --commit "$COMMIT_SHA" \
    "Repository context for this review:
  branch:       $BRANCH
  HEAD commit:  $HEAD_SHA
  target commit: $COMMIT_SHA ($COMMIT_MSG)

Audit ONLY the change in target commit $COMMIT_SHORT. If your checkout does
not contain that commit, STOP and report the mismatch — do not audit a
substitute. Apply this lens: auth gaps, client-trusted inputs (data_env,
project_id, anything else from request body), data-loss risk, schema/field
mismatches, drift between source-of-truth and copies, OAuth refresh
correctness, idempotency on writes, secret handling, error paths that
swallow data, missing input validation. Report findings as P0/P1/P2 with
file:line citations. Be specific. Skip stylistic-only findings unless they
hide a bug."
fi

# --- Default: audit since last baseline ------------------------------------
if [ -n "${1:-}" ]; then
  BASE="$1"
else
  BASE=$(git log --grep='Stamp .* as baseline\|Stamp baseline' --format=%H | sed -n '2p')
  if [ -z "$BASE" ]; then
    BASE=$(git log --format=%H | tail -n 1)
    echo "WARN: no 'Stamp baseline' commit found in history. Auditing from the first commit." >&2
  fi
fi

BASE_SHA=$(git rev-parse "$BASE")
BASE_SHORT=$(git rev-parse --short "$BASE")

# Verify both endpoints of the audit range actually exist locally as
# commits. If we can't resolve them, Codex (reviewing the same checkout)
# can't either — better to fail loudly than send Codex a prompt naming
# SHAs it cannot find.
for sha in "$BASE_SHA" "$HEAD_SHA"; do
  if ! git cat-file -e "${sha}^{commit}" 2>/dev/null; then
    echo "ERROR: commit $sha is not present in the local repo." >&2
    echo "Refusing to invoke Codex with a SHA the checkout cannot resolve." >&2
    exit 5
  fi
done
BASE_MSG=$(git log -1 --format='%s' "$BASE")
HEAD_MSG=$(git log -1 --format='%s' HEAD)
FILES_CHANGED=$(git diff --name-only "$BASE"..HEAD)

echo "Branch:     $BRANCH"
echo "Audit base: $BASE_SHORT ($BASE_MSG)"
echo "Audit head: $HEAD_SHORT ($HEAD_MSG)"
echo "Files changed:"
printf '%s\n' "$FILES_CHANGED" | sed 's/^/  /'
echo "----------"

exec codex review --base "$BASE" \
  "Repository context for this review:
  branch:       $BRANCH
  base commit:  $BASE_SHA ($BASE_MSG)
  HEAD commit:  $HEAD_SHA ($HEAD_MSG)

Audit ALL changes between base $BASE_SHORT and HEAD $HEAD_SHORT. Before
auditing, confirm your checkout contains both commits. If either is
missing, STOP and report the mismatch — do NOT audit a different snapshot
in its place; we have been burned by that before. Files changed in this
range:
$(printf '%s\n' "$FILES_CHANGED" | sed 's/^/  /')

Apply this lens: auth gaps, client-trusted inputs (data_env, project_id,
anything else from request body), data-loss risk, schema/field mismatches,
drift between source-of-truth and copies, OAuth refresh correctness,
idempotency on writes, secret handling, error paths that swallow data,
missing input validation. Report findings as P0/P1/P2 with file:line
citations. Be specific and concrete. Skip stylistic-only findings unless
they hide a bug. If a file in scope has no findings, say so explicitly
rather than padding the report."
