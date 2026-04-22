#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"bug summary or stack trace\""
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MP_BIN="$ROOT_DIR/.venv-mempalace/bin/mempalace"
QUERY="$*"

if [[ ! -x "$MP_BIN" ]]; then
  echo "MemPalace binary not found at: $MP_BIN"
  exit 1
fi

echo "=== Similar incidents / fixes ==="
"$MP_BIN" search "$QUERY" --wing ashveil --room documentation

echo
echo "=== Related code context ==="
"$MP_BIN" search "$QUERY" --wing ashveil --room src
