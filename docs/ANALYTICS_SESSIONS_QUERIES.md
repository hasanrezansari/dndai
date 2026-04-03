# Session analytics — SQL & dashboards

`acquisition_source`, `game_kind`, and timestamps live on **`sessions`** only. They are **not** read by turns, quests, narration, or party phase logic — safe for reporting.

**Apply migrations** so columns exist: `npm run db:migrate` (see [`OPEN_GENRE_IMPLEMENTATION_LOG.md`](OPEN_GENRE_IMPLEMENTATION_LOG.md)).

## Example SQL (PostgreSQL)

### Counts by mode (campaign vs party)

```sql
SELECT game_kind, COUNT(*) AS n
FROM sessions
GROUP BY game_kind
ORDER BY n DESC;
```

### Counts by acquisition funnel label

`acquisition_source` is nullable (organic / legacy rows).

```sql
SELECT COALESCE(acquisition_source, '(none)') AS source, COUNT(*) AS n
FROM sessions
GROUP BY acquisition_source
ORDER BY n DESC;
```

### Party sessions created per day (last 30 days)

```sql
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*) AS n
FROM sessions
WHERE game_kind = 'party'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```

### Cross-tab: `game_kind` × `acquisition_source` (top slices)

```sql
SELECT
  game_kind,
  COALESCE(acquisition_source, '(none)') AS source,
  COUNT(*) AS n
FROM sessions
GROUP BY game_kind, acquisition_source
ORDER BY n DESC;
```

## Metabase / BI notes

- Point the dataset at the same Postgres as `DATABASE_URL` (read replica recommended for production).
- **Do not** join `sessions` to `turns` or `actions` for funnel “health” unless you explicitly want mixed campaign+party traffic — filter `game_kind` in the question.
- Known labels set at create time today include: `falvos_party_home`, `play_romana_party_home` (see home create flow).

## Programmatic snapshot (optional)

When `ASHVEIL_INTERNAL_METRICS=1` and `Authorization: Bearer <INTERNAL_API_SECRET>` (or `NEXTAUTH_SECRET` fallback), **`GET /api/internal/session-metrics`** returns read-only aggregates (no writes). See route implementation; disable in production unless you need ops dashboards.
