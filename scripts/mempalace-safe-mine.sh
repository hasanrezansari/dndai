#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MP_BIN="$ROOT_DIR/.venv-mempalace/bin/mempalace"
LOCK_DIR="$ROOT_DIR/.cursor/hooks/state"
LOCK_FILE="$LOCK_DIR/mempalace-safe-mine.lock"

# Keep created files private to the current user.
umask 077

if [[ ! -x "$MP_BIN" ]]; then
  echo "MemPalace binary not found at: $MP_BIN"
  echo "Run setup first (venv + pip install mempalace)."
  exit 1
fi

LIMIT="0"
if [[ "${1:-}" == "--quick" ]]; then
  LIMIT="60"
fi

# Prevent overlapping mine jobs from hooks/manual runs.
mkdir -p "$LOCK_DIR"
if [[ -f "$LOCK_FILE" ]]; then
  existing_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "[mempalace] safe mine already running (pid=$existing_pid), skipping"
    exit 0
  fi
fi
echo "$$" >"$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# Root-level mine uses project mempalace.yaml (single source of truth) and
# .gitignore protections (.env*, node_modules, etc.) for safer indexing.
INCLUDE_PATHS=("src" "docs" "scripts")
if [[ "${1:-}" != "--quick" ]]; then
  INCLUDE_PATHS+=("server" "components" "tests" "drizzle")
fi
INCLUDE_CSV="$(IFS=,; echo "${INCLUDE_PATHS[*]}")"

echo "[mempalace] syncing project memory from root (limit=$LIMIT)..."
"$MP_BIN" mine "$ROOT_DIR" \
  --wing ashveil \
  --limit "$LIMIT" \
  --include-ignored "$INCLUDE_CSV" \
  --agent ashveil-automation >/dev/null

echo "[mempalace] sync complete"
