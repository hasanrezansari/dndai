#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"continuity query\" [output-file]"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MP_BIN="$ROOT_DIR/.venv-mempalace/bin/mempalace"
QUERY="$1"
OUTPUT_FILE="${2:-$ROOT_DIR/docs/NARRATIVE_CONTINUITY_HINTS.md}"

if [[ ! -x "$MP_BIN" ]]; then
  echo "MemPalace binary not found at: $MP_BIN"
  exit 1
fi

{
  echo "# Narrative Continuity Hints"
  echo
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo "Query: $QUERY"
  echo
  echo "## Advisory Context (Non-Canonical)"
  "$MP_BIN" search "$QUERY continuity unresolved thread npc relation location timeline" --wing ashveil --room documentation
  echo
  "$MP_BIN" search "$QUERY continuity unresolved thread npc relation location timeline" --wing ashveil --room src
} > "$OUTPUT_FILE"

echo "Wrote $OUTPUT_FILE"
