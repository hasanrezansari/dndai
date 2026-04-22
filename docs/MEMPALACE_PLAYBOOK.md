# MemPalace Playbook (Ashveil)

This project uses MemPalace as a non-canonical engineering memory layer.

## Ground rules

- Canonical gameplay state remains in Postgres + existing summarizer/context code.
- MemPalace is advisory context for dev velocity, debugging, and release risk checks.
- Never store raw secrets in docs, notes, or transcript imports.

## Setup (one-time)

```bash
python3 -m venv .venv-mempalace
./.venv-mempalace/bin/pip install mempalace
./.venv-mempalace/bin/mempalace init . --yes
```

## Daily usage

### 1) Sync safe memory automatically

Project hook on `sessionEnd` triggers:

```bash
scripts/mempalace-safe-mine.sh --quick
```

Manual full sync:

```bash
scripts/mempalace-safe-mine.sh
```

### 2) Bug recall workflow

```bash
scripts/mempalace-bug-recall.sh "socket reconnect loop after deploy"
```

Capture each incident with `docs/templates/INCIDENT_RECALL_TEMPLATE.md`.

### 3) Release risk workflow

```bash
scripts/mempalace-release-risk.sh origin/main
```

This generates `docs/RELEASE_RISK_SUMMARY.md` from changed files + memory search.

## Useful queries

```bash
./.venv-mempalace/bin/mempalace search "why did we switch room display layout" --wing ashveil
./.venv-mempalace/bin/mempalace search "Dodo webhook setup" --wing ashveil --room documentation
./.venv-mempalace/bin/mempalace wake-up --wing ashveil
```

## Security posture

- `.env*` files are ignored by project `.gitignore`.
- Safe-mine script only indexes selected source/doc directories.
- MemPalace data remains local at `~/.mempalace/palace` unless you explicitly export.

## Optional narrative continuity (phase 4)

Use retrieved continuity hints as advisory prompt context only.
Do not mutate canonical mechanics/state from MemPalace retrieval alone.

Generate/update hints:

```bash
scripts/mempalace-narrative-continuity.sh "ashveil current arc"
```

Enable in runtime:

```bash
MEMPALACE_NARRATIVE_CONTINUITY=1
MEMPALACE_NARRATIVE_HINTS_FILE=docs/NARRATIVE_CONTINUITY_HINTS.md
```
