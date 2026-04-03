# Worlds catalog & gallery — phased implementation (bottom → top)

**Purpose:** End-to-end build plan for agents and engineers. **Read first:** product truth lives in [`TEMPLATES_AND_CATALOG.md`](./TEMPLATES_AND_CATALOG.md) (UX, dual entry, fork/snapshot rules). **Parallel:** [`PHASE_A_ADVENTURE_LIBRARY_HYGIENE.md`](./PHASE_A_ADVENTURE_LIBRARY_HYGIENE.md) (hide-from-list only — does not replace this doc).

**Approach:** **Bottom-up** — schema → services → APIs → session create integration → UI → polish/SEO/metrics. Each phase is **shippable** or **feature-flagged** so existing flows keep working.

---

## 0. Agent preamble (do not skip)

1. Read [`TEMPLATES_AND_CATALOG.md`](./TEMPLATES_AND_CATALOG.md) **Executive synthesis** + §2–§3 + **Case for playromana.com**.
2. Read **§ Invariants** below before any code change.
3. Verify current behavior: [`src/app/api/sessions/route.ts`](../src/app/api/sessions/route.ts) `POST` + [`createSession`](../src/server/services/session-service.ts); Roma seeds [`ROMA_SEEDS`](../src/lib/rome/seeder.ts); schema [`sessions`](../src/lib/db/schema.ts).
4. Do **not** invent columns or routes — match this doc and `schema.ts` after migration.

---

## Invariants — nothing breaks

| Rule | Detail |
|------|--------|
| **Nullable world linkage** | New `sessions.*` world columns are **NULL** for all existing and new sessions until the client sends a world id (or internal Romana path opts in). |
| **Existing `POST /api/sessions`** | Body without `worldId` behaves **exactly** as today (`moduleKey`, prompts, party `gameKind`, etc.). |
| **Roma / module quick paths** | `module_key`, PlayRomana quick play, party `template_key` flows **unchanged** unless a phase explicitly migrates them to also set `world_id` (additive only). |
| **Gameplay loop** | No changes to [`actions/route.ts`](../src/app/api/sessions/[id]/actions/route.ts), orchestrator, or Pusher contracts in early phases. |
| **Party `game_kind`** | Worlds v1 targets **`campaign`** catalog rows; party in gallery is **out of scope** until a later sub-phase says otherwise. |
| **Auth** | World **list** may be public or semi-public; **fork** (creates session) requires same auth as today’s `createSession` unless product says otherwise. |

---

## Phase 1 — Data model (worlds table + session FKs)

**Goal:** Persist catalog rows and optional session provenance without affecting runtime behavior.

**Deliverables**

- New table `worlds` (name final in schema; alternatives: `story_worlds` if reserved):
  - `id` uuid PK  
  - `slug` text **unique** (URL-safe, for `/worlds/[slug]` and API)  
  - `title` text not null  
  - `subtitle` or `hook` text nullable  
  - `description` text nullable  
  - `status` text not null default `'draft'` — at least `'draft' | 'published'`  
  - `sort_order` integer default 0  
  - `module_key` text nullable — bridges to existing Roma/module keys when `campaign_mode` is `module`  
  - `campaign_mode_default` text nullable — e.g. `user_prompt` | `module` (must match [`CampaignModeSchema`](../src/lib/schemas/enums.ts))  
  - `default_max_players` integer nullable (or hardcode in service if null)  
  - `snapshot_definition` jsonb nullable — **authoritative payload** for fork: theme strings, tags, art direction seeds, optional `world_bible` snippet, anything seeder needs **if** not fully implied by `module_key`  
  - `published_revision` integer not null default 1 — bump when editable content changes; sessions pin revision at fork  
  - `created_at`, `updated_at` timestamptz  
  - Indexes: `(status)`, `(slug)`  

- New **nullable** columns on `sessions`:
  - `world_id` uuid **nullable** FK → `worlds.id` (on delete **restrict** or **set null** — never cascade delete sessions when a world row is deleted; prefer **restrict** + soft-unpublish worlds)  
  - `world_revision` integer **nullable** — copy of `worlds.published_revision` at fork time  
  - `world_snapshot` jsonb **nullable** — **immutable JSON** copied from world at fork (denormalized; survives world edits)  

**Acceptance**

- Migrate/generate per repo (`npm run db:generate`, migrate/push).  
- Existing sessions: all new columns **NULL**.  
- `npm run build` passes.

**Rollback** — Drop columns/table in dev only; prod avoid destructive drops once live.

---

## Phase 2 — Seed worlds from existing authored content

**Goal:** Non-empty gallery without manual DB edits.

**Deliverables**

- One-off script or migration seed: insert **published** rows from [`ROMA_SEEDS`](../src/lib/rome/seeder.ts) keys (title/slug/module_key/`snapshot_definition` from seed + marketing copy).  
- Optional: single **“Featured”** world slug constant for cold playdndai path.

**Acceptance**

- `SELECT * FROM worlds WHERE status = 'published'` returns ≥1 row in dev.  
- No change to runtime session creation yet.

---

## Phase 3 — `world-service` (read + fork mapping)

**Goal:** Single place for catalog logic; **no HTTP yet**.

**New file (suggested):** [`src/server/services/world-service.ts`](../src/server/services/world-service.ts)

**Functions (names indicative)**

- `listPublishedWorlds()` — for gallery API; stable sort (`sort_order`, `title`).  
- `getWorldBySlug(slug)` / `getWorldById(id)` — 404 path internally.  
- `buildCreateSessionParamsFromWorld(worldRow, hostUserId, overrides?)` — returns object compatible with `createSession` **input**: `campaignMode`, `moduleKey`, `adventurePrompt`, `adventureTags`, `artDirection`, `worldBible`, `maxPlayers`, `mode` (session mode), `gameKind` (`campaign`), etc. **Merge rule:** `world_snapshot` at fork = full resolved payload (world row + optional merge from `ROMA_SEEDS` if `module_key` set).  
- `forkWorldToSession({ worldIdOrSlug, hostUserId, ...hostOverrides })` — loads world (must be `published`), computes params, calls **`createSession`**, then **`update` session** to set `world_id`, `world_revision`, `world_snapshot` (if not set inside `createSession` — prefer **one transaction**: extend `createSession` to accept optional world metadata).

**Acceptance**

- Unit tests: fork from fixture world produces session row with non-null `world_id` + `world_snapshot` matching snapshot rules.  
- Calling fork with `draft` world fails with controlled error.

**Integration choice:** Prefer extending [`createSession`](../src/server/services/session-service.ts) with **optional** `worldFork?: { worldId, revision, snapshot }` so insert is atomic — avoids partial sessions.

---

## Phase 4 — API: list + detail + fork

**Goal:** HTTP surface for gallery and “Start this world.”

**Routes (suggested)**

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/api/worlds` | Optional or public | List published worlds (minimal card fields + slug). |
| `GET` | `/api/worlds/[slug]` | Optional or public | Detail for one world (longer copy; no secrets). |
| `POST` | `/api/worlds/[slug]/fork` **or** `POST` `/api/worlds/fork` body `{ slug }` | **Required** (`requireUser`) | Calls `forkWorldToSession`; returns `{ sessionId, joinCode, hostPlayerId }` **same shape** as [`sessions/route.ts`](../src/app/api/sessions/route.ts) `POST` response. |

**Zod** — validate slug/body per project rules.

**Acceptance**

- curl/Thunder: list + fork creates session; host can open lobby as today.  
- `POST /api/sessions` **without** world still works (regression smoke).

---

## Phase 5 — Optional: `worldId` on existing `POST /api/sessions`

**Goal:** Alternative client path: single endpoint.

- Extend [`CreateSessionBodySchema`](../src/app/api/sessions/route.ts) with optional `worldId` or `worldSlug` (uuid vs slug — pick **one** in implementation).  
- If present: **ignore conflicting** manual `moduleKey`/prompt fields **or** define merge precedence in code comments (recommend: **world wins** for seeded fields, host can still override `maxPlayers` if product allows).

**Acceptance**

- Same as Phase 4; document which endpoint is **canonical** for gallery UI (fork route is clearer for analytics “world fork” events).

---

## Phase 6 — Unpublish semantics

**Goal:** Match [`TEMPLATES_AND_CATALOG.md`](./TEMPLATES_AND_CATALOG.md) platform rules.

- `status = 'draft'` or `published = false`: **`list` and `GET detail` exclude`**; **`fork` returns 404**.  
- Existing sessions: **unchanged** (read `world_snapshot`).

**Acceptance**

- Fork fails after unpublish; active session still loads state API.

---

## Phase 7 — UI: worlds gallery (mobile-first)

**Goal:** Visual spine per §3 of vision doc — **does not replace** entire [`page.tsx`](../src/app/page.tsx) in one PR if risky.

**Suggested incremental path**

1. New route **`/worlds`** — lists cards from `GET /api/worlds`; tap → detail sheet/modal → **Start** → `POST fork` → redirect `/lobby/[code]` or `/character/[sessionId]` per existing rules.  
2. **Sticky** header: logo, **Join code**, profile.  
3. **Continue** row: reuse pattern from [`/adventures`](../src/app/adventures/page.tsx) (`GET /api/adventures`) — link to resume.  
4. **Hero** world: first published or flagged `featured` column (optional Phase 1b column `is_featured`).  
5. **Lanes:** v1 static query params or single “Curated” lane; v2 DB `lane` or tags.

**Acceptance**

- Mobile portrait: no horizontal wall of 20 cards above fold without hero + structure.  
- Desktop: wider hero + lanes per vision doc.  
- Liquid Obsidian tokens from [`globals.css`](../src/app/globals.css) — no random hex.

---

## Phase 8 — playdndai home integration

**Goal:** Align entry with **Executive synthesis** — **no duplicate** primary “quick start” if Romana owns instant play.

- Add **Browse worlds** entry → `/worlds`.  
- **Continue** / **Join** prominent per vision.  
- Optional: **featured world** embed on home linking to `/worlds/[slug]`.

**Acceptance**

- New users see clear path to `/worlds`; existing create/join flows untouched.

---

## Phase 9 — Romana ↔ playdndai bridge (product + tech)

**Goal:** Every Romana exit offers **one** obvious path to full platform.

**Deliverables**

- Copy + UI: “More worlds”, “Open playdndai.com”, logged-in deep link.  
- Tech: document cookie/auth behavior (may already exist via bridge routes — grep `bridge`, `MAIN_APP_ORIGIN` in repo).  
- Analytics event: `romana_bridge_click`.

**Acceptance**

- Manual QA: guest or user lands on playdndai with expectation clarity (no dead end).

---

## Phase 10 — SEO & public world pages (optional v1.1)

- `generateMetadata` on `/worlds/[slug]` for public indexing.  
- Sitemap entries for published slugs.  
- Avoid indexing **session** URLs as world canonical.

---

## Phase 11 — Metrics (plays, likes — evolution)

- Server event on successful fork: `world_forked` { `world_id`, `revision`, `user_id` hash }.  
- Later: likes table or aggregate play counts — **do not block** Phase 1–8.

---

## Phase 12 — Party worlds in gallery (explicitly later)

- Decision: tab vs filter vs exclude.  
- Extend `worlds` with `game_kind_default` or separate `party_template_key` when schema is agreed.

---

## Verification matrix (run before merge to main)

| Check | Pass criteria |
|-------|----------------|
| Regression | `POST /api/sessions` body from current [`page.tsx`](../src/app/page.tsx) create flow still 201. |
| Roma | Quick play / module start still works; optional `world_id` set if you add mapping. |
| Party | Party room create unchanged. |
| Fork | New session has `world_snapshot` JSON; seeder/narrator receive same effective premise as manual equivalent. |
| Unpublish | Fork blocked; live session playable. |
| Mobile | `/worlds` usable one-thumb; tap targets ≥ 44pt effective. |

---

## Document map (context for agents)

| Doc | Role |
|-----|------|
| [`TEMPLATES_AND_CATALOG.md`](./TEMPLATES_AND_CATALOG.md) | **Why** — UX, GTM, fork metaphor |
| **This file** | **How** — phased build, invariants |
| [`PHASE_A_ADVENTURE_LIBRARY_HYGIENE.md`](./PHASE_A_ADVENTURE_LIBRARY_HYGIENE.md) | My Adventures hide — orthogonal |
| [`WORLDS_GALLERY_RESEARCH_NOTES.md`](./WORLDS_GALLERY_RESEARCH_NOTES.md) | Raw research only |

---

## History

- **2026-04:** Initial phased plan (bottom-up, non-breaking).
- **2026-04:** Catalog metrics: `worlds.is_featured`, `fork_count`, `world_likes`; `GET /api/internal/world-metrics` (same gate as session-metrics); Roma seed sets `is_featured` on `FEATURED_WORLD_MODULE_KEY`. After `db:reset`, run `db:migrate` (via reset script) then `pnpm run db:seed:worlds`.
