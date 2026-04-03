# Worlds gallery — deeper UI/UX & UGC (phased roadmap)

**Status:** Planning document — extends shipped v1 (see [`WORLDS_CATALOG_IMPLEMENTATION_PHASES.md`](./WORLDS_CATALOG_IMPLEMENTATION_PHASES.md)) toward [`TEMPLATES_AND_CATALOG.md`](./TEMPLATES_AND_CATALOG.md) §3 and the “YouTube-style card + player submissions” direction.

**Assumption:** Core fork flow is validated in production; safe to deepen presentation, navigation, and (later) creator publishing without changing gameplay contracts established in v1.

**Invariants (carry forward):**

- Do not break `POST /api/sessions` without `worldSlug`, Roma quick paths, or party flows unless a phase explicitly migrates them.
- Published vs draft semantics: list/detail/fork only expose **published** rows; unpublish stays 404 for fork.
- `world_snapshot` at fork remains immutable provenance.

---

## Phase 1 — Catalog media & card model (schema + API)

**Goal:** Support **visual-first** cards (image on top, text below) like YouTube/Netflix thumbnails.

**Deliverables**

- `worlds` columns (names indicative):
  - `cover_image_url` text nullable — HTTPS URL to poster/wide art (Vercel Blob or CDN; validate origin if needed).
  - Optional: `cover_image_alt` text nullable (accessibility).
  - Optional: `card_teaser` text nullable — one-line hook under title when different from `subtitle`.
- Migration + Drizzle schema; seed script sets **placeholder or Roma-themed** covers for existing rows (or leave null with graceful UI fallback).
- Extend `GET /api/worlds` and `GET /api/worlds/[slug]` DTOs with new fields; no secrets in public JSON.

**Acceptance**

- Cards can render 16:9 (or fixed aspect) image + title + teaser + tags strip.
- Empty `cover_image_url` degrades to gradient/typographic placeholder using existing Liquid Obsidian tokens.

---

## Phase 2 — Gallery UI: YouTube/Netflix-style cards & hero

**Goal:** Replace text-primary tiles with **rich cards** and a **cinematic hero**.

**Deliverables**

- [`/worlds`](../src/app/worlds/page.tsx) — card component: **image header** (object-fit cover), title, optional teaser, tag chips, **fork/like** micro-stats, tap target ≥ 44pt.
- **Hero lane:** full-width featured world — larger art, primary “Open / Start” path; respect `is_featured` + sort order.
- **Desktop:** optional two-column hero zone (hero left, short value prop + CTAs right) per §3.4 — only if it does not fork mobile IA.

**Acceptance**

- Mobile: no “wall of identical text boxes”; first scroll matches §3.1 spirit (orientation + hero + start of discovery).
- No raw hex; tokens from [`globals.css`](../src/app/globals.css).

---

## Phase 3 — Lanes & discovery (horizontal rails)

**Goal:** Move from a single “All worlds” grid toward **curated rails** (Netflix pattern).

**Deliverables**

- **v3a (static):** 2–3 lanes with hardcoded titles, e.g. “Staff picks”, “Ancient Rome”, “Quick sessions” — filter by `slug` set, `tags` in `snapshot_definition`, or `is_featured`.
- **v3b (data-driven):** optional `worlds.lane` text or `lane_tags` jsonb + admin/seed control; `GET /api/worlds?lane=` or grouped payload `{ lanes: [{ id, title, worlds }] }`.
- Horizontal scroll on mobile with snap/accessible scroll hints; keyboard focus on desktop.

**Acceptance**

- Cold visitor sees **hero + at least two lanes** before a dense “all” section (or “Browse all” affordance).
- Performance: one list API or batched query — avoid N+1 per card.

---

## Phase 4 — World detail: expand-before-commit

**Goal:** **Read full pitch** before fork — sheet vs page decision.

**Deliverables**

- **Option A (recommended mobile):** `WorldDetailSheet` — bottom sheet from gallery listing with long description, tags, stats, **Start** sticky footer; deep link still resolves (URL updates query `?world=` or parallel `/worlds/[slug]`).
- **Option B:** Keep [`/worlds/[slug]`](../src/app/worlds/[slug]/page.tsx) but add **expandable sections** (accordion), trailer-style header image, share preview metadata already from Phase 10 SEO.
- Align **Start** → existing `POST /api/worlds/[slug]/fork` (no new fork semantics).

**Acceptance**

- User can scan **image + tags + long copy** without creating a session.
- SEO: public slug pages remain indexable; session URLs not canonical (robots refinements optional sub-phase).

---

## Phase 5 — playdndai home: §3.1 spine (without duplicating instant lane)

**Goal:** Main [`page.tsx`](../src/app/page.tsx) **orientation** closer to Executive synthesis — **Continue / Join / Browse worlds** prominent; **no competing** primary “quick start” if Romana (or `/play`) owns instant play.

**Deliverables**

- Reorder/sectioning: short **brand + promise**, **CTA strip** (Browse worlds, Join, Adventures/Continue), optional **embedded featured world** strip linking to `/worlds/[slug]`.
- Respect existing create/join flows; feature-flag or incremental PRs if risky.

**Acceptance**

- New user sees **clear** path to `/worlds` without removing working create session UX.
- PlayRomana build: bridge + “More worlds” remain coherent with [`ROMANA_PLAYDNDAI_BRIDGE.md`](./ROMANA_PLAYDNDAI_BRIDGE.md).

---

## Phase 6 — UGC: player / creator → gallery (product + platform)

**Goal:** Let **trusted users** submit worlds for others to fork — **not** automatic public spam.

**Deliverables (sequenced)**

1. **Schema:** `created_by_user_id` nullable on `worlds`; optional `submitted_at`, `reviewed_by`, `review_status` (`draft` | `pending_review` | `published` | `rejected`) — merge with existing `status` carefully or use parallel enum.
2. **API (authenticated):** `POST /api/worlds/submissions` (create draft from host premise snapshot or structured form); host-only or role-gated.
3. **Moderation:** internal route or admin list (could reuse `ASHVEIL_INTERNAL_METRICS` pattern with stronger auth) to approve → `published`.
4. **Gallery contract:** list endpoints only return **published**; submitters see their drafts under `/profile` or `/my-worlds`.
5. **Abuse & limits:** rate limits, max body sizes, report hook (stub OK for v1).

**Acceptance**

- Random players cannot silently appear on public `/api/worlds` without review.
- Fork still produces `world_snapshot` and respects revision rules.

---

## Phase 7 — Polish & desktop density

**Goal:** Hover states, second column filters, Human/AI DM as **badges/filters** on cards (per §3.2) once `worlds` exposes `default_mode` or per-world flags.

**Deliverables**

- Filter chips row (client-side or query param).
- Optional “Trending” lane driven by `fork_count` / time window (requires analytics query or materialized rollup — later).

**Acceptance**

- Desktop layout uses width without a separate “desktop brand.”

---

## Phase 8 — Optional follow-ups (document only)

- **robots.txt / noindex** for `/session/*`, `/lobby/*` if SEO team wants stricter canonical discipline.
- **Party worlds** in gallery — see Phase 12 in [`WORLDS_CATALOG_IMPLEMENTATION_PHASES.md`](./WORLDS_CATALOG_IMPLEMENTATION_PHASES.md).
- **Share cards** / recap links — TEMPLATES § stickiness.

---

## Suggested implementation order

| Order | Phase | Rationale |
|-------|-------|-----------|
| 1 | Phase 1 | Unblocks all visual design |
| 2 | Phase 2 | User-visible win fast |
| 3 | Phase 4 | Stronger “try before fork” before splitting traffic across many lanes |
| 4 | Phase 3 | Lanes need stable card + optional grouping API |
| 5 | Phase 5 | Home changes affect first impression — after `/worlds` feels finished |
| 6 | Phase 6 | UGC is largest product/legal surface — ship polished catalog first |
| 7 | Phase 7 | Filters and desktop density |

Adjust order if marketing needs **home** before **lanes**.

---

## References

| Doc | Role |
|-----|------|
| [`TEMPLATES_AND_CATALOG.md`](./TEMPLATES_AND_CATALOG.md) | Full UX vision §3, §4 metrics/UGC evolution |
| [`WORLDS_CATALOG_IMPLEMENTATION_PHASES.md`](./WORLDS_CATALOG_IMPLEMENTATION_PHASES.md) | Completed v1 backend + incremental UI scope |
| [`ROMANA_PLAYDNDAI_BRIDGE.md`](./ROMANA_PLAYDNDAI_BRIDGE.md) | Two-domain / bridge behavior |

---

## History

- **2026-04:** Initial v2 roadmap (deep UI/UX + UGC + media cards).
