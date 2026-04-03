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

## Roadmap — optional follow-ups

| # | Track | Task | Notes |
|---|--------|------|--------|
| 1 | **Optional provider** | [`freepik-provider.ts`](../src/lib/ai/freepik-provider.ts) | Not wired in `image-worker` today; only needed if you add `FREEPIK_API_KEY` and call it. No staging smoke test required otherwise. |
| 2 | **Launch polish** | PWA, ARIA, ToS, moderation, beta — see [`PRODUCTION_ROADMAP.md`](../PRODUCTION_ROADMAP.md) §24 | Product roadmap, not open-genre core. |
| 3 | **Party mode (Jackbox-style)** | [`PARTY_MODE_SPEC.md`](PARTY_MODE_SPEC.md) | Separate feature track; reuse premise columns, tone bias, image-worker, session payload patterns from Phases 12–16 (see spec § Alignment with recent open-genre work). |

## Verification

- `npm test` — all unit tests passing (run after changes).
- `npm run db:migrate` — run against your real Postgres when `DIRECT_URL` / `DATABASE_URL` is set.
