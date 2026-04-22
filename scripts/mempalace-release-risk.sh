#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MP_BIN="$ROOT_DIR/.venv-mempalace/bin/mempalace"
BASE_BRANCH="${1:-origin/main}"
OUTPUT_FILE="${2:-$ROOT_DIR/docs/RELEASE_RISK_SUMMARY.md}"

if [[ ! -x "$MP_BIN" ]]; then
  echo "MemPalace binary not found at: $MP_BIN"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

CHANGED=()
while IFS= read -r line; do
  CHANGED+=("$line")
done < <(cd "$ROOT_DIR" && git diff --name-only "$BASE_BRANCH"...HEAD)

{
  echo "# Release Risk Summary"
  echo
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Base: $BASE_BRANCH"
  echo

  if [[ ${#CHANGED[@]} -eq 0 ]]; then
    echo "No changed files detected against $BASE_BRANCH."
    exit 0
  fi

  echo "## Changed Files"
  for f in "${CHANGED[@]}"; do
    echo "- \`$f\`"
  done
  echo

  echo "## Historical Risks and Similar Incidents"
  for f in "${CHANGED[@]}"; do
    q="regression risk $f"
    echo
    echo "### $f"
    "$MP_BIN" search "$q" --wing ashveil | sed 's/^/    /'
  done

  echo
  echo "## Suggested Test Focus"
  echo "- Exercise changed routes/components in realistic user paths."
  echo "- Re-test recently touched bug classes surfaced above."
  echo "- Validate auth, billing, and realtime flows when touched."
} > "$OUTPUT_FILE"

echo "Wrote $OUTPUT_FILE"
