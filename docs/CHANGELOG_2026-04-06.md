# Changelog — 2026-04-06 (Ashveil)

**Branch:** `monetisation`  
**Documented HEAD:** `818a7c6221a6a45512d948091079727cb0c3878d`  
**As of:** 2026-04-06  

After that commit, a **one-line** ESLint fix was applied in `src/server/services/session-state-payload.ts` (`let` → `const` destructuring). Commit that file together with this changelog and `docs/_patches/` if you want a fully green follow-up snapshot.

This document summarizes **all work landed on 2026-04-06** in two commits. For **line-by-line** review, use the git commands or patch files listed in [Machine-readable diffs](#machine-readable-diffs).

---

## Summary

| Commit | Subject |
|--------|---------|
| `0e7e233` | Sparks wallet, economy service, paid-route wiring (Drizzle 0017–0018, debits, `GET /api/wallet`) |
| `818a7c6` | Checkout, webhooks, shop; chapter runtime, spark pool, session presence/feeds; quest/orchestrator/narrative continuity; UI and tests (Drizzle 0019–0021) |

---

## Part A — `0e7e233` — feat(monetization): Sparks wallet, economy service, paid-route wiring

**Author / date:** Mon Apr 6 14:26:51 2026 +0530  

**Intent (from commit message):**

- Add `user_wallets` + `spark_transactions` (Drizzle **0017**) and `purchased_hero_slots` (**0018**).
- `spark-economy-service`: debit/credit with idempotency; `MONETIZATION_SPEND_ENABLED` gate.
- `spark-pricing` constants; `402 insufficient_sparks` JSON; `GET /api/wallet`.
- Wire debits: campaign actions (AI DM), session start, scene image, party scene-image, party judge + round opener, generate-class, portraits, hero slot purchase + copy.
- Docs: `MONETIZATION_IMPLEMENTATION_PLAN.md`, `MONETIZATION_PAID_ROUTES.md`; `.env.example` flags.

**Files touched (25):**

| Area | Paths |
|------|--------|
| Migrations | `drizzle/0017_old_excalibur.sql`, `drizzle/0018_parallel_gambit.sql`, `drizzle/meta/0017_snapshot.json`, `drizzle/meta/0018_snapshot.json`, `drizzle/meta/_journal.json` |
| API | `src/app/api/wallet/route.ts`, `src/app/api/characters/generate-class/route.ts`, `src/app/api/characters/portrait/route.ts`, `src/app/api/profile/heroes/route.ts`, `src/app/api/profile/heroes/[id]/portrait/route.ts`, `src/app/api/profile/heroes/copy/route.ts`, `src/app/api/sessions/[id]/actions/route.ts`, `src/app/api/sessions/[id]/image/route.ts`, `src/app/api/sessions/[id]/party/scene-image/route.ts`, `src/app/api/sessions/[id]/start/route.ts` |
| Core | `src/lib/db/schema.ts`, `src/lib/spark-pricing.ts`, `src/lib/api/errors.ts` |
| Services | `src/server/services/spark-economy-service.ts`, `src/server/services/spark-portrait-gate.ts`, `src/server/services/party-phase-service.ts`, `src/server/services/profile-hero-service.ts` |
| Docs / env | `.env.example`, `docs/MONETIZATION_IMPLEMENTATION_PLAN.md`, `docs/MONETIZATION_PAID_ROUTES.md` |

---

## Part B — `818a7c6` — Monetisation follow-up + session performance + narrative continuity

**Author / date:** Mon Apr 6 22:35:09 2026 +0530  

**Intent (from commit message):**

- Spark purchases (Dodo / Stripe / Razorpay), checkout routes, webhooks, credit flow.
- Shop UI, spark balance HUD, monetization helpers and docs.
- Chapter runtime, spark pool, migrations (chapter caps, spark pool, narrative `situation_anchor`).
- Session state: presence feed, scene-status, feed-traces, slimmed hydrate, Pusher hooks.
- Quest: closure gating, roll caps, quest signaler updates.
- Narrator: `situation_anchor`, `narrative_beat`; visual-delta heuristics + anchor + establishing shot.
- Combat strip, journal, lobby, session pages; unit tests.

**Files touched:** 82 paths (see patch file or `git show 818a7c6 --name-only`).

**Grouped inventory:**

| Theme | Paths |
|-------|--------|
| **Checkout / payments** | `src/app/api/checkout/sparks/route.ts`, `src/app/api/checkout/sparks/confirm/route.ts`, `src/app/api/webhooks/dodo/route.ts`, `src/app/api/webhooks/razorpay/route.ts`, `src/app/api/webhooks/stripe/route.ts`, `src/lib/monetization/*`, `src/server/services/dodo-spark-purchase-service.ts`, `src/server/services/spark-purchase-credit.ts`, `src/types/razorpay-window.d.ts` |
| **Shop / HUD** | `src/app/shop/page.tsx`, `src/app/shop/success/page.tsx`, `src/components/game/spark-balance-hud.tsx` |
| **Chapter / pool / migrations** | `src/lib/chapter/chapter-config.ts`, `src/server/services/chapter-runtime-service.ts`, `src/app/api/sessions/[id]/chapter/continue/route.ts`, `src/app/api/sessions/[id]/spark-pool/contribute/route.ts`, `drizzle/0019_chapter_caps.sql`, `drizzle/0020_session_spark_pool.sql`, `drizzle/0021_swift_eddie_brock.sql`, `drizzle/meta/0021_snapshot.json`, `drizzle/meta/_journal.json`, `src/lib/db/schema.ts` |
| **Session APIs / payload** | `src/app/api/sessions/[id]/presence/route.ts`, `src/app/api/sessions/[id]/scene-status/route.ts`, `src/app/api/sessions/[id]/display-scene-status/route.ts`, `src/app/api/sessions/[id]/feed-traces/route.ts`, `src/app/api/sessions/[id]/state/route.ts`, `src/app/api/sessions/[id]/route.ts`, `src/app/api/sessions/[id]/actions/route.ts`, `src/app/api/sessions/[id]/start/route.ts`, `src/app/api/sessions/[id]/image/route.ts`, `src/app/api/sessions/[id]/party/scene-image/route.ts`, `src/app/api/sessions/[id]/vote-end/route.ts`, `src/server/services/session-state-payload.ts`, `src/server/services/session-service.ts`, `src/server/services/spark-economy-service.ts`, `src/server/services/party-phase-service.ts`, `src/lib/feed/merge-chronicle-feed.ts` |
| **Orchestrator / quests** | `src/lib/orchestrator/pipeline.ts`, `src/lib/orchestrator/apply-state.ts`, `src/lib/orchestrator/context-builder.ts`, `src/lib/orchestrator/workers/narrator.ts`, `src/lib/orchestrator/workers/visual-delta.ts`, `src/lib/orchestrator/workers/quest-signaler.ts`, `src/server/services/quest-service.ts`, `src/lib/schemas/ai-io.ts`, `src/lib/schemas/domain.ts`, `src/lib/schemas/state-patches.ts`, `src/lib/schemas/fixtures.ts` |
| **Memory / mock AI** | `src/lib/memory/assembler.ts`, `src/lib/memory/index.ts`, `src/lib/ai/mock-provider.ts` |
| **Client / realtime** | `src/app/session/[id]/page.tsx`, `src/app/lobby/[code]/page.tsx`, `src/app/profile/page.tsx`, `src/app/character/[sessionId]/page.tsx`, `src/components/game/combat-strip.tsx`, `src/components/game/quest-pill.tsx`, `src/components/game/party-play-panel.tsx`, `src/lib/socket/use-session-channel.ts`, `src/lib/state/game-store.ts`, `src/components/ui/toast.tsx`, `src/components/sheets/journal-sheet.tsx`, `src/lib/copy/ashveil.ts` |
| **Rules / deps / docs** | `.cursor/rules/ai-orchestration.mdc`, `package.json`, `pnpm-lock.yaml`, `.env.example`, `docs/MONETIZATION_IMPLEMENTATION_PLAN.md`, `docs/MONETIZATION_PAID_ROUTES.md`, `docs/PERFORMANCE_AND_QUEST_TUNING_BACKLOG.md`, `docs/VERTEX_AI_INTEGRATION_BACKLOG.md`, `docs/blank.md` |
| **Tests** | `tests/unit/quest-service.test.ts`, `tests/unit/workers.test.ts`, `tests/unit/mixed-party-simulation.test.ts` |
| **Profile API** | `src/app/api/profile/heroes/route.ts` |

---

## Machine-readable diffs

Patches are stored under `docs/_patches/2026-04-06/` (generated for this changelog):

| File | Contents |
|------|----------|
| `committed_0e7e233.patch` | Full diff of commit `0e7e233` (~7953 lines) |
| `commit_818a7c6_monetisation_followup.patch` | Full diff of commit `818a7c6` (~10748 lines) |

Regenerate locally:

```bash
git show 0e7e233 -p --no-color > docs/_patches/2026-04-06/committed_0e7e233.patch
git show 818a7c6 -p --no-color > docs/_patches/2026-04-06/commit_818a7c6_monetisation_followup.patch
```

**Note:** After these commits, `git diff HEAD` is empty; there is no separate “dirty worktree” patch.

---

## Audit — 2026-04-06

### Automated

| Check | Result |
|-------|--------|
| `pnpm lint` | **Pass** (exit 0). **3 warnings:** unused `catalog` in `src/app/api/checkout/sparks/route.ts`; unused `incrementChapterSystemImageUsage` import in `src/app/api/sessions/[id]/party/scene-image/route.ts`; `react-hooks/exhaustive-deps` in `src/app/lobby/[code]/page.tsx` (~line 287). |
| `pnpm test` | **Pass** — Vitest: **25** files, **157** tests, all passed. |
| `pnpm build` | **Pass** — Next.js 16.2.1 production build completed; TypeScript check passed. |

### Lint fix applied during audit

- `src/server/services/session-state-payload.ts`: changed `let` → `const` for destructuring from `deriveSceneDisplaySlice` (ESLint `prefer-const`). This was the only lint **error** blocking a clean run; warnings remain as above.

### Database migrations

- `pnpm db:migrate` was run but **did not complete successfully** in this environment (connection/driver exited early). **Action:** run `pnpm db:migrate` against your dev/staging database with valid `DIRECT_URL` (or your Drizzle config) and confirm migrations **0017–0021** apply in order on a non-production database before production.

### Manual / integration smoke

- **Not executed** in this run (no live session, payment keys, or webhook signing exercised). Recommended spot checks: wallet read, one spark debit path, checkout happy path in test mode, one webhook with valid signature, lobby → session Pusher events, one full AI turn after narrator/visual-delta changes.

### Honest scope

Passing lint (with warnings), tests, and build does **not** prove payment providers, webhooks, or multiplayer sessions are flawless in production; it proves the codebase typechecks, bundles, and unit tests pass at audit time.
