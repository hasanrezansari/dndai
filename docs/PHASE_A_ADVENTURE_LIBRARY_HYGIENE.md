# Phase A — Adventure library hygiene (“Hide from list”)

**Status:** Implementation checklist  
**Scope:** Per-user visibility only. **Out of scope:** deleting `sessions`, deleting `players`, host-only rules, template catalog (Phase B).

This doc is the execution checklist for Phase A. It is safe to ship in isolation if every **“must not break”** item below is verified before merge.

**See also (parallel track):** [Worlds & gallery ecosystem](./TEMPLATES_AND_CATALOG.md) — Netflix-style **worlds** landing for playdndai.com; separate from this hygiene work.

---

## Goals

- Users can **remove clutter** from **My Adventures** (`/adventures`) without affecting other players or live game state.
- **Semantics:** “Hide from **my** list” = a row in a **per-user** table (or equivalent), **not** “delete the campaign for everyone.”

## Non-goals (do not implement in Phase A)

- Removing membership (`players` row), **Leave table**, or session teardown.
- Changing `GET /api/sessions/[id]/state`, Pusher contracts, orchestration, or turn flow.
- Phase B catalog, `template_id`, or unpublish rules.

---

## Must not break (regression guardrails)

| Area | Rule |
|------|------|
| **Shared sessions** | After user A hides a session, user B (still a member) must still see it in **their** list if/when they have a list that uses the same query pattern; hiding is **scoped to `user_id`**. |
| **Gameplay** | Direct navigation to `/session/[id]`, lobby, character flow, and APIs must behave the same if the user is still a `players` row. Hiding is **not** an auth revocation. |
| **`GET /api/adventures`** | Response shape stays `{ adventures: [...] }` with the same fields as today; only **filtering** changes for the current user. |
| **Unauthenticated** | No change to public or unauth routes; hide API requires auth like the existing adventures GET. |
| **DB integrity** | New table uses FKs to existing `users` + `sessions` (or equivalent); **no** `ON DELETE` behavior that cascades into deleting sessions when a user hides. Prefer FK on `session_id` with **restrict** / no cascade delete of `sessions`. |
| **Idempotency** | Hiding twice or unhiding when not hidden should **not** 500; return 200/204 or clear 404 only where appropriate. |
| **Join codes / links** | Bookmarked `/session/[id]` URLs still work for members; copy in UI must not imply the room was deleted. |

---

## Implementation checklist

Use these in order. Check boxes as you complete each step.

### 1. Schema

- [ ] Add table **`user_hidden_sessions`** (name may vary; keep it obvious in code review):
  - `user_id` — `text`, **not null**, FK → `users.id` (same pattern as `players.user_id`).
  - `session_id` — `uuid`, **not null**, FK → `sessions.id`.
  - `hidden_at` — `timestamptz`, **not null**, default `now()`.
  - **Unique constraint** on `(user_id, session_id)`.
  - **Index** suitable for list filtering, e.g. `(user_id)` or `(user_id, session_id)` (unique already helps lookups).
- [ ] Confirm FK on `session_id` does **not** cascade delete sessions when hiding/unhiding user rows.
- [ ] Run project DB workflow: `npm run db:generate` and migrate / `db:push` per repo convention.

**File:** [`src/lib/db/schema.ts`](../src/lib/db/schema.ts)

### 2. List query (server)

- [ ] Update [`listAdventuresForUser`](../src/server/services/adventure-service.ts) to **exclude** rows where `(user_id, session_id)` exists in `user_hidden_sessions`.
  - Prefer **`NOT EXISTS`** subquery or **left join + null check**; keep the existing join/group logic intact.
- [ ] **Do not** change how `playerCount`, `isHost`, or sorting are computed except where a hidden session is omitted entirely.

**File:** [`src/server/services/adventure-service.ts`](../src/server/services/adventure-service.ts)  
**Consumer:** [`src/app/api/adventures/route.ts`](../src/app/api/adventures/route.ts) (GET only — no response shape break).

### 3. API — hide

- [ ] Add route handler, e.g. **`POST`** [`/api/adventures/[sessionId]`](../src/app/api/adventures/) (or `PUT` — pick one and document here):
  - `requireUser()`; 401 if anonymous.
  - Validate `sessionId` as UUID.
  - **`isSessionMember(sessionId, user.id)`** — 403 if not a member (do not allow hiding arbitrary IDs).
  - **Upsert** hidden row (idempotent).
  - Return JSON e.g. `{ ok: true }` with appropriate status.
- [ ] Follow [`handleApiError`](../src/lib/api/errors.ts) / existing API patterns.

### 4. API — unhide (recommended)

- [ ] **`DELETE`** same resource (or POST body `hidden: false` — prefer RESTful DELETE):
  - Same auth + membership checks.
  - Delete hidden row; idempotent if already visible.

### 5. UI — `/adventures`

- [ ] Add control per card: **“Hide from list”** (not “Delete” / not “Delete for everyone”).
- [ ] **Confirm** dialog with accurate copy: e.g. hides from this list only; session remains for others; you may still rejoin via link/code if you are still at the table.
- [ ] On success: [`useToast`](../src/components/ui/toast) + remove card from local state or **refetch** `GET /api/adventures`.
- [ ] Disable button or show loading while request in flight; handle error toast on failure.

**File:** [`src/app/adventures/page.tsx`](../src/app/adventures/page.tsx)

### 6. Profile / other surfaces (parity audit)

- [ ] Search the codebase for other **session lists** or duplicates of adventure history (e.g. grep: `listAdventures`, `/api/adventures`, `sessionId` lists in dashboard-style UI).
- [ ] If any screen shows the same logical list without going through `listAdventuresForUser`, either:
  - route it through the **same service/filter**, or
  - document **intentional** difference in this file.

*(As of this doc, only [`src/app/adventures/page.tsx`](../src/app/adventures/page.tsx) consumes `GET /api/adventures`; re-audit before merge.)*

### 7. Quality gate

- [ ] `npm run build` passes.
- [ ] Lint clean on touched files.
- [ ] Manual QA using the matrix in the next section.

---

## Manual QA matrix

| # | Scenario | Expected |
|---|----------|----------|
| 1 | User A hides session X | A’s `/adventures` no longer shows X; `GET /api/adventures` omits X for A. |
| 2 | User B still member of X | B’s list **still** shows X (if B uses same API). |
| 3 | A opens `/session/[id]` for X (still a player) | Session loads as before (no new 403 from hide alone). |
| 4 | A unhides X | X reappears on `/adventures`. |
| 5 | A hides X twice | No error; still hidden. |
| 6 | Non-member calls hide for X | 403. |
| 7 | Anonymous calls hide | 401. |

---

## Rollback

- Revert migration (drop `user_hidden_sessions`) only if no production dependency; otherwise leave table and revert code — hidden rows are inert without the filter.

---

## Related planning

- Phase B (catalog / templates) is **independent**; do not mix into this PR.
- High-level plan context: Cursor plan `adventure_list_delete` (project plans directory).
