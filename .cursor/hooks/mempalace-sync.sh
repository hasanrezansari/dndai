#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MP_BIN="$ROOT_DIR/.venv-mempalace/bin/mempalace"

if [[ ! -x "$MP_BIN" ]]; then
  exit 0
fi

# Non-blocking sync keeps interactive sessions snappy.
nohup "$ROOT_DIR/scripts/mempalace-safe-mine.sh" --quick >/dev/null 2>&1 &
exit 0
