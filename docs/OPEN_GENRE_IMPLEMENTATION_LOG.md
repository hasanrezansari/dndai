# Open-genre implementation log

Execution follows the phased plan.

## Database

- Migration `drizzle/0008_heavy_sleeper.sql` adds `sessions.adventure_tags`, `art_direction`, `world_bible` plus unrelated tables (`friend_*`, `profile_heroes`, `user_profile_settings`). Statements are **idempotent** where practical (`IF NOT EXISTS`, duplicate-safe FK blocks) so partial reruns are safer.
- **Apply locally:** `npm run db:migrate` (uses `DIRECT_URL` or `DATABASE_URL` from `.env.local` via `drizzle.config.ts`). If the migration journal is out of sync or you are fine wiping dev data, reset the DB (e.g. `npm run db:reset` if you use that script) and migrate fresh.
- **Production:** If an environment already applied an **older** version of `0008`, do not replace the file blindly; reconcile `drizzle.__drizzle_migrations` and schema by hand.

## Done (this branch)

### Phase 0 — Baseline

- Documented grep targets in earlier iterations; core code paths read.

### Phase 1 — Database

- `sessions`: `adventure_tags` (jsonb `string[]`, nullable), `art_direction` (text), `world_bible` (text).
- Migration: `drizzle/0008_heavy_sleeper.sql` (idempotent DDL as above).

### Phase 2 — API / types

- `SessionSchema` + `createMockSession` fixture: new fields.
- `createSession()` + `POST /api/sessions`: optional `adventureTags`, `artDirection`, `worldBible` (Zod limits); narrative seed max length aligned with UI (8000).
- `PATCH /api/sessions/[id]` (lobby, host): optional `max_players`, `adventure_prompt`, `world_bible`, `art_direction`, `adventure_tags` — `updateSessionLobbyPremise` + Pusher `session-premise-updated`.
- `session-state-payload` / `GameSessionView`: premise fields for client.
- `SessionPremiseUpdatedEventSchema` in [`src/lib/schemas/events.ts`](../src/lib/schemas/events.ts) (empty payload; refetch session).

### Phase 3–5 — Narrative core

- [`src/lib/ai/narrative-session-profile.ts`](../src/lib/ai/narrative-session-profile.ts): facilitator line, style hints, PlayRomana detection, OpenRouter system builders.
- [`context-builder.ts`](../src/lib/orchestrator/context-builder.ts): `TurnContext.session` includes `campaignMode`, `moduleKey`, `adventureTags`, `artDirection`, `worldBible`.
- [`pipeline.ts`](../src/lib/orchestrator/pipeline.ts): session-aware narrator system prompt + `world_bible_excerpt` (up to 4k).
- [`narrator.ts`](../src/lib/orchestrator/workers/narrator.ts): core instructions, `buildNarratorSystemPrompt`, facilitator param, `world_bible_excerpt` in user JSON.
- [`assembler.ts`](../src/lib/memory/assembler.ts): canonical state includes `Premise (host):` from `world_bible` when set.

### Phase 6 — Campaign start

- [`start/route.ts`](../src/app/api/sessions/[id]/start/route.ts): open seeder copy, neutral openings, `seedUserPrompt` includes premise fields.

### Phase 7 — Images

- [`image-worker.ts`](../src/lib/orchestrator/image-worker.ts): `styleHint` from `art_direction` + tags; default pack when no keyword match is cinematic neutral. **`STYLE_PROFILES.fantasy`** applies only when fantasy keywords match in the theme hint — copy is **painted adventure / mythic illustration**, not “dark fantasy” defaults; other profiles’ negative prompts avoid implying fantasy as the only alternative.
- [`openrouter-image-provider.ts`](../src/lib/ai/openrouter-image-provider.ts): optional neutral system prompt.
- [`freepik-provider.ts`](../src/lib/ai/freepik-provider.ts): `styling.style` set to **`cinematic`** so the API preset is less genre-locked (prompt still drives setting). If Freepik rejects the value, revert per their current enum list.

### Phase 8 — Misc workers / routes

- Intent, rules, consequence, summarizer, quest-signaler: neutral framing where needed.
- [`final-chapter/route.ts`](../src/app/api/sessions/[id]/final-chapter/route.ts): neutral closing prose.
- [`custom-class-generation-service.ts`](../src/server/services/custom-class-generation-service.ts): neutral system line.

### Phase 9 — Home & lobby UI

- [`page.tsx`](../src/app/page.tsx) (home): Falvos create flow collects tone tags (`LOBBY_TONE_TAG_OPTIONS`), `worldBible`, `artDirection`, long narrative seed.
- [`lobby/[code]/page.tsx`](../src/app/lobby/[code]/page.tsx): host “Tune the portal” — drafts, **Save premise** → `PATCH`, subscribes to `session-premise-updated`; teaser can use `world_bible` snippet.

### Phase 10 — Visual delta

- [`visual-delta.ts`](../src/lib/orchestrator/workers/visual-delta.ts): broader **location / scene-shift** keywords for modern, sci-fi, and urban settings (still heuristic, deterministic).

### Phase 11 — Tests

- [`tests/unit/narrative-session-profile.test.ts`](../tests/unit/narrative-session-profile.test.ts).
- `workers.test.ts`, `mixed-party-simulation.test.ts`: narrator + visual delta coverage.

### Phase 12 — Docs, rules, and “dark default” cleanup (this pass)

- **Canonical spec (two copies kept in sync):** [`docs/ASHVEIL_SPEC.md`](ASHVEIL_SPEC.md) and repo root [`ASHVEIL_SPEC.md`](../../ASHVEIL_SPEC.md) — open-genre thesis, core promise, campaign seed examples, “living table” / portal UX copy, mode card strings, typography row clarifies `.text-fantasy`, lobby AI DM presence line.
- **Cursor rules:** [`.cursor/rules/ashveil-project.mdc`](../.cursor/rules/ashveil-project.mdc) (open-genre + Liquid Obsidian = UI, not genre), [`.cursor/rules/design-system.mdc`](../.cursor/rules/design-system.mdc) (`.text-fantasy` note).
- **Class UX / prompts:** custom class field label “One-line pitch”; portrait route uses `One-line class pitch:`; `custom-class-generation-service` instructs models that `fantasy` JSON field is genre-agnostic.
- **Ashveil app grep:** no remaining **“dark fantasy”** strings in runtime image style paths; comments in `narrative-session-profile` / `openrouter-image-provider` / seeder still mention “no dark fantasy default” as a guardrail (intentional).

### Phase 13 — Legacy root specs + Cursor clarity (this pass)

- **Repo root:** [`ai_multiplayer_dd_spec.md`](../../ai_multiplayer_dd_spec.md), [`ai_multiplayer_dd_cursor_master_pack.md`](../../ai_multiplayer_dd_cursor_master_pack.md), [`FINAL_ai_multiplayer_dd_master_spec.md`](../../FINAL_ai_multiplayer_dd_master_spec.md) — canonical pointer to `ASHVEIL_SPEC.md`, open-genre user promise and seeds, UI-vs-fiction separation, updated image JSON example.
- **[`.cursor/rules/ashveil-project.mdc`](../.cursor/rules/ashveil-project.mdc):** explicit note that **`.text-fantasy` is typography only**, not genre.

### Phase 14 — Narrator fallback + premise-aware presets

- [`narrator.ts`](../src/lib/orchestrator/workers/narrator.ts): fallback atmosphere lines are **neutral by default**; optional **tech / urban / horror / fantasy** pools only when `fallbackPremiseHint` + scene text match keywords. `cast_spell` verb map uses genre-neutral wording. Pipeline passes tags, prompt, world bible slice, and `art_direction` into `fallbackPremiseHint`.
- [`class-presets.ts`](../src/lib/rules/class-presets.ts): `getPresetClassesForPremise()` — same mechanical `value` keys as `CLASSES`; **labels / role / pitch** vary by inferred pack (sci-fi, modern, horror, fantasy, neutral). Character page loads session premise from `GET /api/sessions/:id` and maps presets accordingly.
- Tests: [`class-presets.test.ts`](../tests/unit/class-presets.test.ts).

### Phase 15 — Concept-first hero flow + session-aware class gen + display labels

- **Character page** ([`character/[sessionId]/page.tsx`](../src/app/character/[sessionId]/page.tsx)): default tab **Describe your role** when custom classes are enabled; **Your role** section after name/pronouns; **role preview** card after controls; quick chassis hint chips; `POST /api/characters/generate-class` sends `adventure_prompt`, `adventure_tags`, `world_bible`, `art_direction` from the session.
- **API** [`generate-class/route.ts`](../src/app/api/characters/generate-class/route.ts) + [`custom-class-generation-service.ts`](../src/server/services/custom-class-generation-service.ts): `campaign_context` in user JSON steers ability/gear naming to the table setting.
- **Play surface:** [`session-state-payload.ts`](../src/server/services/session-state-payload.ts) + [`display-class.ts`](../src/lib/characters/display-class.ts) add `displayClass` + `mechanicalClass` on `GamePlayerView.character`. [`character-sheet.tsx`](../src/components/sheets/character-sheet.tsx) / [`party-sheet.tsx`](../src/components/sheets/party-sheet.tsx) show **display** name; icons use **mechanical** key. [`assembler.ts`](../src/lib/memory/assembler.ts) party line drops redundant `mechanical` suffix for the model.
- Tests: [`character-display-class.test.ts`](../tests/unit/character-display-class.test.ts).

### Phase 16 — Landing copy + tone bias (no new UX)

- **Marketing / shell:** [`src/lib/copy/ashveil.ts`](../src/lib/copy/ashveil.ts) `COPY.landing`, Falvos [`page.tsx`](../src/app/page.tsx) hero + how-it-works + facilitator wording; [`brand.ts`](../src/lib/brand.ts) tagline; [`layout.tsx`](../src/app/layout.tsx) meta / Open Graph for open-genre positioning.
- **Tone bias:** [`narrative-session-profile.ts`](../src/lib/ai/narrative-session-profile.ts) `buildToneBiasFromAdventureTags()` — nudges narrator system prompt from existing lobby `adventure_tags` only (cozy vs consequence vs comedy clusters). Does not touch rules / dice pipeline.
- **Starting gear / races / custom race:** [`gear-presets.ts`](../src/lib/rules/gear-presets.ts), [`race-presets.ts`](../src/lib/rules/race-presets.ts), [`character.ts`](../src/lib/rules/character.ts) `normalizeCharacterRace`, API + character page — premise-aware labels + optional custom race string.

### Party mode — MVP shipped (parallel to campaign)

Party uses `game_kind: "party"` and `party_config` JSON; campaign quest / actions / turns stay on `game_kind: "campaign"`. Open-genre **premise columns** (prompt, tags, world bible, art direction) still feed **party merge** and **scene image** — that is shared context, not a merged game mode.

**Done (implemented in tree):**

- **DB:** [`drizzle/0009_unusual_blockbuster.sql`](../drizzle/0009_unusual_blockbuster.sql) — `sessions.game_kind`, `sessions.party_config`.
- **Types / schema:** [`src/lib/schemas/party.ts`](../src/lib/schemas/party.ts), [`GameKindSchema`](../src/lib/schemas/enums.ts), session fixtures / domain as wired.
- **Defaults / packs:** [`src/lib/party/party-templates.ts`](../src/lib/party/party-templates.ts) — brand default `template_key`, timer constants, **`PartyTemplatePack`** (`mergeSpine`, per-round milestones for `default` / `falvos_party_v1` / `playromana_party_v1`).
- **Create:** `POST /api/sessions` — `gameKind`, `templateKey`, `partyTotalRounds`, `partyInstigatorEnabled`; Falvos **Party game** card + Play Romana **Start party room** on [`page.tsx`](../src/app/page.tsx).
- **Start:** [`start/route.ts`](../src/app/api/sessions/[id]/start/route.ts) — party skips campaign seeder / first turn; `activatePartySessionFromLobby`; broadcasts **`session-started`** with `game_kind: "party"` + [`broadcastPartyStateRefresh`](../src/lib/party/party-socket.ts) (`state-update` + **`party-state-updated`**).
- **Guards:** Party sessions cannot use RPG [`actions`](../src/app/api/sessions/[id]/actions/route.ts) / [`turn-service`](../src/server/services/turn-service.ts) submit path; [`vote-end`](../src/app/api/sessions/[id]/vote-end/route.ts) 409; quest init / state payload quest omitted for party as implemented.
- **APIs:** [`party/submit`](../src/app/api/sessions/[id]/party/submit/route.ts), [`party/vote`](../src/app/api/sessions/[id]/party/vote/route.ts), [`party/phase-tick`](../src/app/api/sessions/[id]/party/phase-tick/route.ts) (submit + vote deadline nudge), [`party/forgery-guess`](../src/app/api/sessions/[id]/party/forgery-guess/route.ts), [`party/me`](../src/app/api/sessions/[id]/party/me/route.ts) (per-player secret briefing when `party_secrets` dealt).
- **Merge:** `tryPartyMergeWhenReady` — merge when **all** participants submitted **or** submit **deadline passed** with at least one line; if deadline passes with **zero** lines, submit window is **extended**; **single submitted line** skips the vote phase and awards that player the round. AI: [`party-merge`](../src/lib/orchestrator/workers/party-merge.ts) + [`party-merge-runner`](../src/lib/orchestrator/party-merge-runner.ts) (template spine/milestones, optional [`party-forgery-line`](../src/lib/orchestrator/workers/party-forgery-line.ts) when `instigator_enabled`); **tone bias** from `buildToneBiasFromAdventureTags` in merge system prompt.
- **Vote / rounds:** Only players with a valid vote target must vote; **`tryPartyVoteDeadlineAdvance`** fills missing votes after the vote deadline (deterministic) then tallies. VP, `carry_forward`, last round → `ended` ([`party-vote-resolution.ts`](../src/lib/party/party-vote-resolution.ts) pure helpers + [`applyPartyVoteAndMaybeAdvance`](../src/server/services/party-phase-service.ts)).
- **Scene image:** `party_config.scene_image_url`; internal [`party/scene-image`](../src/app/api/sessions/[id]/party/scene-image/route.ts) + [`party-image-schedule.ts`](../src/lib/orchestrator/party-image-schedule.ts) after merge (needs app origin + internal auth like campaign image jobs).
- **State / TV:** [`session-state-payload.ts`](../src/server/services/session-state-payload.ts) — party overrides `narrativeText` / `sceneImage` / `scenePending` / title; [`session/[id]/display`](../src/app/session/[id]/display/page.tsx) **party** branch (larger narration label, phase teaser, meta chip).
- **Realtime:** [`use-session-channel`](../src/lib/socket/use-session-channel.ts) binds **`party-state-updated`** (refetch + `stateVersion`). [`PartyStateUpdatedEventSchema`](../src/lib/schemas/events.ts).
- **Client:** [`session/[id]/page.tsx`](../src/app/session/[id]/page.tsx) + [`party-play-panel.tsx`](../src/components/game/party-play-panel.tsx); submit/vote countdown; `phase-tick` polling in **submit and vote**; end state **Start a full campaign** → `/`.
- **Lobby:** Party sessions show explainer copy; host start returns `partyMode`; Pusher `session-started` carries `game_kind` — clients open **`/session/[id]`** instead of **`/character/[sessionId]`** (hero sheet optional).
- **Tests:** [`tests/unit/party-vote-resolution.test.ts`](../tests/unit/party-vote-resolution.test.ts).
- **Apply:** `npm run db:migrate` after pull.

**Later / product (remaining optional items):**

| Area | Notes |
|------|--------|
| **Analytics consumption** | **Done:** [`ANALYTICS_SESSIONS_QUERIES.md`](ANALYTICS_SESSIONS_QUERIES.md) (SQL / Metabase); optional read-only [`GET /api/internal/session-metrics`](../src/app/api/internal/session-metrics/route.ts) when `ASHVEIL_INTERNAL_METRICS=1` + bearer secret. **Does not affect gameplay.** |
| **Party spec maintenance** | **`PARTY_MODE_SPEC.md`** § Implementation status (canonical) table + pointer here — replaces retired flat checklist (**Phase 20**). |
| **Dedicated `/party` marketing route** | **Phase 21** — optional product surface (not required for core loop). |

---

<a id="closure-roadmap"></a>

## Closure roadmap — pending items (ordered plan)

Goal: **finish the party product loop** (instigator UX, secret roles, analytics usability, docs) **without touching campaign semantics**. Work proceeds in **vertical slices**; each slice merges only after **campaign regression** (tests + manual smoke) passes.

### A. Non-negotiables (every phase)

1. **`game_kind === "campaign"`** — No new behavior in `turn-service`, `actions`, quest init, narrator pipeline, or `vote-end` except **bugfixes** unrelated to party. Party features live under `party/*` routes, `party-phase-service`, `party-merge*`, and **`if (game_kind === "party")` branches** that **short-circuit** campaign paths (already the pattern).
2. **Payload safety** — Anything secret (slot→forgery map, role cards, objectives) is **never** in TV-safe / broadcast payloads; only via **authenticated** `GET .../party/me` (or future equivalent).
3. **Config versioning** — Prefer **backward-compatible** optional fields on `PartyConfigV1` first; introduce `version: 2` only if a breaking shape is unavoidable (document migration in `party-phase-service` parse path).
4. **CI** — `npm test` + `npm run build` green before merge; add Vitest per slice (payload redaction, phase transitions, BP math).

### B. Phase 17 — Instigator: anonymous slots + guess + reveal ✅ (implemented)

**Shipped:** `runPartyMergeForConfig` returns [`PartyMergeResult`](../src/lib/orchestrator/party-merge-runner.ts) with optional [`PartyRoundSlots`](../src/lib/party/party-slot-utils.ts) when instigator + **2+** player lines + non-empty forgery; merge flow is `submit` → `forgery_guess` → `vote` → `reveal` (short) → next `submit` or `ended`. [`partyConfigForSessionPayload`](../src/lib/schemas/party.ts) hides `slotAttribution` until `party_phase === "reveal"`; **+1** per correct guess in `fp_totals`. Single-player-with-forgery rounds still skip `forgery_guess` (fast path to tally).

**Previous gap (resolved):** [`party-merge-runner.ts`](../src/lib/orchestrator/party-merge-runner.ts) used to only append forgery as prose; slots and phases are now wired end-to-end.

| Step | Work |
|------|------|
| 17.1 | **Slot model:** When `instigator_enabled` and merge runs, build ordered **`slot_id` → { text, attribution: player \| forgery }** server-side; persist **`slot_attribution`** (and **`instigator_slot_id`**) in `party_config` for the round; merge worker still receives the same combined text for AI. |
| 17.2 | **Client-safe view:** Extend `partyConfigForSessionPayload` (or parallel helper) to expose **anonymous list** `submissionSlots: { slotId, text }[]` **without** attribution until `party_phase === "reveal"` (or dedicated reveal flag). TV uses the same sanitized shape. |
| 17.3 | **Phase machine:** Add phase **`forgery_guess`** (or spec-approved fold into vote) **only when** `instigator_enabled` — e.g. `narrate` → `forgery_guess` → `vote` → `reveal`. Timers in `party_config` (`phase_deadline_iso`) mirror submit/vote patterns; **`phase-tick`** advances deadlines. |
| 17.4 | **API:** `POST .../party/forgery-guess` (or extend `party/vote` with typed payload): one guess per player per round; validate seated, no duplicate; store in `party_config` (e.g. `forgery_guesses: Record<playerId, slotId>`). |
| 17.5 | **Scoring:** On reveal, award **BP or bonus VP** per template rules in [`party-templates.ts`](../src/lib/party/party-templates.ts) (template-tunable constants); persist in `party_config` (e.g. `bp_totals` or reuse a dedicated field). |
| 17.6 | **UI:** [`party-play-panel.tsx`](../src/components/game/party-play-panel.tsx) + display route: show slot list during guess; reveal phase shows which slot was forgery + points. |
| 17.7 | **Tests:** Vitest for (1) pre-reveal JSON shape has **no** `slot_attribution` in client view, (2) guess resolution scoring deterministic. |

**Campaign impact:** None if all changes are gated on `game_kind === "party"` and merge runner only refactors **party** merge input assembly.

### C. Phase 18 — Secret roles + objectives + dual leaderboard ✅ (v1)

**Shipped:** Server-only **`party_secrets`** jsonb; roles dealt when the host starts the party ([`activatePartySessionFromLobby`](../src/server/services/party-phase-service.ts) → [`dealPartySecretsIfNeeded`](../src/server/services/party-secret-service.ts)) for templates with [`getPartySecretTemplatePack`](../src/lib/party/party-templates.ts) `enabled` (Falvos + Play Romana packs). **4–5 players → 1 secret seat; 6 → 2** (3-player tables get none). Objectives use **keyword detection** on each line submit ([`evaluatePartySecretObjectivesOnSubmit`](../src/server/services/party-secret-service.ts)); **+1 secret BP** per completed objective. [`GET .../party/me`](../src/app/api/sessions/[id]/party/me/route.ts) returns only the caller’s role/objectives/BP. [`partyConfigForSessionPayload`](../src/lib/schemas/party.ts) adds **`secretBpTotals`** when **`party_phase === "ended"`** (aggregate scores for TV/end screen — no hidden role text).

**Previous gap (resolved):** `party/me` stub only.

**Follow-ups (not v1):** Optional `partySecretRolesEnabled` on create to force off; richer verification than keywords; Vitest for deal fairness (currently covered by integration risk only).

**Campaign impact:** None — new column and routes branch on `party` only; campaign rows keep `party_secrets` null.

### D. Phase 19 — Analytics loop closed (operational, not gameplay) ✅

- **[`docs/ANALYTICS_SESSIONS_QUERIES.md`](ANALYTICS_SESSIONS_QUERIES.md)** — example PostgreSQL + Metabase notes (`acquisition_source`, `game_kind`, time buckets).
- **[`GET /api/internal/session-metrics`](../src/app/api/internal/session-metrics/route.ts)** — read-only JSON aggregates when **`ASHVEIL_INTERNAL_METRICS=1`** and **`Authorization: Bearer`** matches `INTERNAL_API_SECRET` or `NEXTAUTH_SECRET`; returns **404** when disabled (no gameplay code paths).

**Campaign impact:** None — SELECT-only on `sessions`.

### E. Phase 20 — Documentation debt ✅

- **[`PARTY_MODE_SPEC.md`](PARTY_MODE_SPEC.md)** — flat checkbox backlog **replaced** by **§ Implementation status (canonical)** table; open-genre alignment § kept.
- **This log** — Later/product table condensed to optional items only.

### F. Phase 21 — Dedicated `/party` marketing route (optional)

- Static or lightly dynamic page: same CTAs as home party card; `metadata` / OG tags; link from layout or footer as product chooses. **No** shared game logic — links into existing create/join flows.

### G. Phase 22 — Production hardening (outside open-genre code)

- Follow [`PRODUCTION_ROADMAP.md`](PRODUCTION_ROADMAP.md) (ToS, moderation, ARIA, PWA, beta). **Does not block** “feature complete” party loop for friends-and-family.

### H. Definition of done (entire closure)

- [x] Instigator path: slots + guess + reveal + scoring + tests + TV safe.
- [x] Secret roles: deal + `party/me` + v1 verification + dual leaderboard + tests.
- [x] Analytics: documented consumption path (and optional read-only API).
- [x] `PARTY_MODE_SPEC.md` checklist replaced by status table; this log updated.
- [x] `npm test` + `npm run build` green (CI gate for this repo).
- [ ] Manual smoke (human): one **campaign** session start → action → narration; one **party** room with instigator + secret-capable template (`falvos_party_v1` / `playromana_party_v1`, 4+ players).

## Roadmap — optional follow-ups

| # | Track | Task | Notes |
|---|--------|------|--------|
| 1 | **Optional provider** | [`freepik-provider.ts`](../src/lib/ai/freepik-provider.ts) | Not wired in `image-worker` today; only needed if you add `FREEPIK_API_KEY` and call it. No staging smoke test required otherwise. |
| 2 | **Launch polish** | PWA, ARIA, ToS, moderation, beta — see [`PRODUCTION_ROADMAP.md`](../PRODUCTION_ROADMAP.md) §24 | Product roadmap, not open-genre core. |
| 3 | **Party mode (Jackbox-style)** | [`PARTY_MODE_SPEC.md`](PARTY_MODE_SPEC.md) | Shipped through Phase 20; optional: Phase 21 `/party` route, Phase 22 production hardening — [Closure roadmap](#closure-roadmap). |

## Verification

- `npm test` — all unit tests passing (run after changes).
- `npm run db:migrate` — run against your real Postgres when `DIRECT_URL` / `DATABASE_URL` is set.
- Session analytics: [`ANALYTICS_SESSIONS_QUERIES.md`](ANALYTICS_SESSIONS_QUERIES.md); optional [`GET /api/internal/session-metrics`](../src/app/api/internal/session-metrics/route.ts) with `ASHVEIL_INTERNAL_METRICS=1` (see [`../.env.example`](../.env.example)).
