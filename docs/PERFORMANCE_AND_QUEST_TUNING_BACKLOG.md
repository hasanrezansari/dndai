# Performance & quest tuning backlog

This document tracks known gaps and fixes discussed for **DB bandwidth (Supabase egress)**, **realtime/client traffic**, **scene images**, **quest meter vs narrative**, and **NPC/combat consistency**. Items are ordered so earlier work reduces load and confusion before finer product polish.

---

## 1. Multiplayer HTTP storms (DB egress)

### Problem

Several browsers hitting the same session multiply **identical** server work. Each heavy request runs many SQL queries; Supabase bills **egress** on data read from Postgres.

### Current behavior

- **`GET /api/sessions/[id]/state`** runs [`loadSessionStatePayload`](../src/server/services/session-state-payload.ts) (many sequential queries per request).
- While a scene image is pending, [`use-session-channel.ts`](../src/lib/socket/use-session-channel.ts) polls full state on a **5s** interval — **×N clients**.
- Party phases: [`party-play-panel.tsx`](../src/components/game/party-play-panel.tsx) POSTs **`/party/phase-tick` every 10s** per client — **×N clients**.
- Same route **updates** `players.is_connected` on every successful state GET ([`state/route.ts`](../src/app/api/sessions/[id]/state/route.ts)), amplifying writes when clients poll.

### Target fix

| Action | Notes |
|--------|--------|
| Remove or replace scene poll | Prefer Pusher `scene-image-ready` / `scene-image-failed`; if a fallback is required, **one** elected client polls, or add a **minimal** endpoint (pending + URL only). |
| Collapse phase-tick | Only **host** (or one client) calls `phase-tick`, increase interval, or run merges from a **server cron** / single scheduler. |
| Decouple presence | Move `is_connected` to a **debounced heartbeat** (e.g. PATCH every 30–60s) or subscribe event — not on every full hydrate. |
| Slim hydrate | Cap `scene_snapshots` (no unbounded scan), reduce `orchestration_traces` / action limits for routine loads; dedupe NPC queries; paginate feed where possible. |

### Success criteria

- Vercel: fewer invocations/min on `/state` and `/party/phase-tick` during active play.
- Supabase: lower **Database egress** for the same sessions.

---

## 2. Heavy payload: `loadSessionStatePayload`

### Problem

One “hydrate” pulls session, players, narratives, **all** scene snapshots for the session, many actions/dice, traces, turns, memory, NPCs twice, etc. Long campaigns increase cost per request.

### Current behavior

See [`session-state-payload.ts`](../src/server/services/session-state-payload.ts): unbounded `scene_snapshots` load; large limits on actions and `state_delta` traces.

### Target fix

- `ORDER BY created_at DESC LIMIT k` for snapshots (or “latest image row” only).
- Lower trace limit or load stat-feed traces **lazily** (separate route when opening history).
- Consolidate duplicate `npcStates` reads into one query reused for names + combatants.

### Success criteria

- Smaller median response size for `/state`; fewer sequential round-trips per hydrate.

---

## 3. Scene images: cadence and budgets

### Problem

Players expect **major visual beats**, not an image every time narration mentions a location. **Campaign** and **party** modes behave differently.

### Current behavior

- [`checkVisualDelta`](../src/lib/orchestrator/workers/visual-delta.ts): combines **deterministic heuristics** (keywords, scene-summary overlap, novelty), **prior vs new `situation_anchor`** (location noun drift), and the narrator’s **`narrative_beat`** (`warrants_establishing_shot` + `setting_change`) so story-shaped moments can request art without always needing two keyword hits. When `image_needed` is true, **`after()`** in [`actions/route.ts`](../src/app/api/sessions/[id]/actions/route.ts) runs **`runImagePipeline`** only after **[`assertChapterImageBudget`](../src/server/services/chapter-runtime-service.ts)** passes (**campaign** and **party**: `used` < `budget`), then increments usage on success.
- Opening and action pipelines still respect sparks/monetization on other paths.

### Target fix

| Action | Notes |
|--------|--------|
| Campaign | Keep chapter budget; optionally **tighten heuristics** (stricter keywords, minimum turns between images, require `priority === "high"`). |
| Party | Add a **party-specific automatic image budget** or cooldown so behavior matches campaign expectations. |
| Product copy | Clarify in UI: “Automatic scene images this chapter: X of Y.” |

### Success criteria

- Fewer redundant images in long sessions; consistent expectations across **campaign** and **party**.

---

## 4. Quest progress vs story geography (“100% before the gold mine”)

### Problem

The **quest bar** reads like “how close we are to the objective in the fiction,” but it is **mechanical**: progress advances from **dice outcomes** and action weights ([`applyTurnQuestProgress`](../src/server/services/quest-service.ts), [`scoreFromRoll`](../src/server/services/quest-service.ts)), not from narrator-verified milestones (“entered the mine”).

### Current behavior

- Hitting **100%** sets `ready_to_end` and can open ending vote — independent of whether narration says the party has arrived at a location.
- Works for abstract “pressure toward resolution”; **conflicts** with open-ended stories where players expect geographic closure.

### Target fix (choose one or combine)

| Approach | Description |
|----------|-------------|
| **UI honesty** | Rename or subtitle the meter (“Mission momentum” / “Pressure”) so it is not read as literal map progress. |
| **Slower meter** | Reduce `progressDelta` from rolls or add a **per-chapter cap** on progress gained. |
| **Narrative gating** | Require [`generateQuestSignal`](../src/lib/orchestrator/workers/quest-signaler.ts) (or similar) to assert a **milestone** before allowing `ready_to_end`, or tie “threshold” to explicit beats in quest state. |
| **Seeded objectives** | Prefer milestone-style objectives in session setup for open-ended playtests (“Secure the claim”) vs pure location lines if the meter must align. |

### Success criteria

- Playtesters stop reporting “bug: 100% but we are not there yet,” or they understand the meter by design.

---

## 5. Duplicate NPCs (e.g. sea serpent ×3)

### Problem

One creature appears as **serpent head**, **serpent**, and **Sea Serpent** with separate HP pools and feed lines.

### Current behavior

[`ensureNpcTargetsExist`](../src/lib/orchestrator/pipeline.ts) dedupes only by **exact** normalized name match. Different strings create **new** `npc_states` rows, defaulting to **hostile**.

### Target fix

- **Canonical name map** or fuzzy merge (normalize “serpent / sea serpent / serpent head” → one id).
- When applying consequences, **map** aliases to the same `npc_states.id`.
- Optional: `introduced_turn_id` + “same encounter” grouping in UI.

### Success criteria

- One row per narrative entity unless the table intentionally splits (e.g. two distinct bosses).

---

## 6. “Everyone looks like a foe” / hostile defaults

### Problem

Allies and neutrals can appear in the same **combat-oriented** list as enemies, or new NPC rows default to **hostile**, which clashes with narration (e.g. captain becomes friendly).

### Current behavior

- Auto-created NPCs use `role: "hostile"`, `attitude: "hostile"` in [`ensureNpcTargetsExist`](../src/lib/orchestrator/pipeline.ts).
- [`mapNpcRowToCombatantView`](../src/lib/state/npc-combatant-mapper.ts) exposes `role` / `attitude` for the client strip.

### Target fix

- Default new NPCs to **neutral** until narration/consequences set **hostile**.
- **Filter or split** UI: “Threats” vs “People present” (or hide non-hostile from the threat strip).
- Ensure **consequence / narrative** steps update attitude when the story declares truce or friendship.

### Success criteria

- Friendly NPCs are not shown as indistinguishable from monsters unless the fiction says so.

---

## 7. Ending vote vs chaos after 100%

### Problem

After **objective threshold**, players can still **crit-fail** navigation; narration gets darker while the **quest meter stays at 100%**. That is coherent drama but **confusing** if the UI implies “you already won.”

### Current behavior

Progress does not roll back on failures once at 100%; ending vote has its own rules ([`maybeOpenEndingVote`](../src/server/services/quest-service.ts), vote evaluation).

### Target fix

- **Copy**: explain that 100% means “table may end the adventure,” not “ship is safe.”
- Optional: **second meter** (e.g. danger / ship integrity) as the dramatic tension line, or pause progress at 100% until vote resolves.

### Success criteria

- Less “we won but everything is on fire” confusion, or players enjoy it as intentional tone.

---

## 8. Deferred infrastructure (not required for the above)

- **Kafka / self-hosted WebSockets / GCP vs AWS**: only revisit if metrics after application-level fixes still justify cost or control.

---

## Implementation order (suggested)

1. **Tier A egress**: scene poll + phase-tick + presence decoupling (largest DB win, low UX risk if Pusher remains primary).
2. **Tier B**: slim `loadSessionStatePayload`.
3. **Quest + NPC**: duplicate NPC merge + quest meter UX/gating + hostile defaults / UI split (player-facing clarity).
4. **Images**: party budget + tighter visual delta (product-dependent).
5. **Ending / danger** copy and optional mechanics.

---

## Related files (index)

| Area | Files |
|------|--------|
| State hydrate | [`session-state-payload.ts`](../src/server/services/session-state-payload.ts), [`state/route.ts`](../src/app/api/sessions/[id]/state/route.ts), [`feed-traces/route.ts`](../src/app/api/sessions/[id]/feed-traces/route.ts) (lazy Chronicle stat rows) |
| Client realtime | [`use-session-channel.ts`](../src/lib/socket/use-session-channel.ts) |
| Party tick | [`party-play-panel.tsx`](../src/components/game/party-play-panel.tsx), [`phase-tick/route.ts`](../src/app/api/sessions/[id]/party/phase-tick/route.ts) |
| Quest | [`quest-service.ts`](../src/server/services/quest-service.ts) |
| NPC create | [`pipeline.ts`](../src/lib/orchestrator/pipeline.ts) |
| Images | [`visual-delta.ts`](../src/lib/orchestrator/workers/visual-delta.ts), [`chapter-runtime-service.ts`](../src/server/services/chapter-runtime-service.ts) |
| Chapter budget in actions | [`actions/route.ts`](../src/app/api/sessions/[id]/actions/route.ts) |

This doc is the **single checklist** for closing the gaps above; track subtasks in issues or PRs as you implement.

---

## Audit status (codebase review)

Last reviewed against repo: **2026-04-06**. “Done” means the **target fix** from this doc is implemented, not that the area is perfect.

| # | Area | Status | Evidence / notes |
|---|------|--------|-------------------|
| 1a | Scene image **5s poll** (full `/state`) | **Done** | Pusher primary; host or room display polls **`GET .../scene-status`** / **`display-scene-status`** every **30s** via [`use-session-channel.ts`](../src/lib/socket/use-session-channel.ts). |
| 1b | **Phase-tick** × every client | **Done** | [`party-play-panel.tsx`](../src/components/game/party-play-panel.tsx): only **`isHost`** runs interval (**30s**) + immediate first POST. |
| 1c | **Presence** decoupled from GET `/state` | **Done** | [`state/route.ts`](../src/app/api/sessions/[id]/state/route.ts): no presence write on GET; [`presence/route.ts`](../src/app/api/sessions/[id]/presence/route.ts) **PATCH** + **45s** heartbeat in `use-session-channel`. |
| 1d | **Slim hydrate** (snapshots, traces, NPC dedupe) | **Done** | [`session-state-payload.ts`](../src/server/services/session-state-payload.ts): snapshots capped; **`state_delta` traces removed from `/state`**; lazy **`GET .../feed-traces`** (Chronicle); actions **90**; **one** `npcStates` query. |
| 2 | **Realtime events** (Pusher) for gameplay | **Already in place** | Session channel + `scene-image-ready`, `state-update`, etc. — this is **why** removing HTTP polling is safe. |
| 3a | **Campaign** chapter **image budget** | **Already in place** | [`assertChapterImageBudget`](../src/server/services/chapter-runtime-service.ts): enforces `used >= budget` when `game_kind === "campaign"`. |
| 3b | **Party** automatic image budget | **Done** | [`assertChapterImageBudget`](../src/server/services/chapter-runtime-service.ts) enforces for **`party`**; [`party/scene-image`](../src/app/api/sessions/[id]/party/scene-image/route.ts) checks budget + **`incrementChapterSystemImageUsage`**; party session UI shows **used / budget** under header. |
| 3c | **Tighter visual delta** + story beats | **Done** | [`visual-delta.ts`](../src/lib/orchestrator/workers/visual-delta.ts): **`image_needed`** from ≥2 heuristics **or** narrator **`narrative_beat`** (establishing shot + new venue / world-shaking) **or** anchor geography shift + venue beat **or** world-shaking + one heuristic; priority considers beat class. |
| 4 | **Quest meter** tied to narrative geography | **Improved** | [`quest-service.ts`](../src/server/services/quest-service.ts): softer **`scoreFromRoll`**; **`CHAPTER_ROLL_PROGRESS_CAP`** per chapter; **`ready_to_end`** requires AI **`closure_ready`** or **3 turns** at 100%; chapter advance resets roll budget via **`syncQuestStateAfterChapterAdvance`**. **Continuity:** [`narrator.ts`](../src/lib/orchestrator/workers/narrator.ts) + **`narrative_events.situation_anchor`** ([`fetchLatestSituationAnchor`](../src/lib/memory/assembler.ts)): each beat commits a one-line factual anchor; the next prompt gets **`established_situation`** so the model should not contradict place/travel state (e.g. sea vs land) without earned change. Quest-specific “you reached the gold mine” milestones are still not a separate system from the meter. |
| 4b | **UI copy** (“momentum” vs literal objective) | **Done** | [`quest-pill.tsx`](../src/components/game/quest-pill.tsx) + [`QuestDock`](../src/components/game/quest-pill.tsx) + [`journal-sheet.tsx`](../src/components/sheets/journal-sheet.tsx): momentum copy added. |
| 5 | **NPC name dedupe** (fuzzy / alias) | **Done** | [`pipeline.ts`](../src/lib/orchestrator/pipeline.ts): **`matchNpcRowByLabel`** (token overlap + substring) in **`ensureNpcTargetsExist`** and **`resolveNpcTarget`**. |
| 6a | **Neutral default** for auto-created NPCs | **Done** | New rows use **`role` / `attitude` `neutral`**. |
| 6b | **Combat strip** hides non-threats | **Done** | [`combat-strip.tsx`](../src/components/game/combat-strip.tsx): **Foes** (hostile), **Allies** (friendly/ally attitudes), **NPCs** (neutral/unknown) — each shows the character’s **name** under the portrait. |
| 7 | **Ending / danger** explanatory copy at 100% | **Done** | [`quest-pill.tsx`](../src/components/game/quest-pill.tsx): note when **`progress >= 100`** and session active. |
| 8 | Infra (Kafka / migrate off Vercel) | **Deferred** | Intentionally out of scope until app-level fixes ship. |

**Summary:** **Phases A–F and optional quest/NPC follow-ups** are implemented: egress + payload slimming; party image budget + visual delta; quest copy; NPC fuzzy match, neutral defaults, **`npc_mark_hostile`** on combat targeting, combat strip split; quest mechanics (**chapter roll cap**, **closure gating**, softer scores); post-deploy metrics (**§16**) documented as a manual dashboard check.

---

## Step-by-step TODOs (execute in order)

Use this as a sprint checklist; check boxes in PRs or issues.

### Phase A — DB egress (highest impact)

1. [x] **Scene poll:** Remove 5s `pollSceneImage` loop or replace with **Pusher-only** path; if fallback required, only **host** polls OR add `GET .../scene-status` (minimal JSON, no full `loadSessionStatePayload`).
2. [x] **Phase-tick:** Gate `POST /party/phase-tick` so only **host** (or `isHost` from party state) runs the interval; **or** increase interval (e.g. 30s); **or** server-side cron for merges.
3. [x] **Presence:** Remove `is_connected` update from [`state/route.ts`](../src/app/api/sessions/[id]/state/route.ts) GET; add `PATCH /api/sessions/[id]/presence` or reuse existing pattern with **30–60s** client debounce.
4. [x] **Snapshots query:** In [`session-state-payload.ts`](../src/server/services/session-state-payload.ts), replace unbounded `sceneSnapshots` select with **latest N** or latest-with-image only; verify narrative/image pairing still works.

### Phase B — Payload weight

5. [x] Reduce **`orchestrationTraces` limit** (300 → lower) or move stat-feed traces to **lazy** API — **lazy `feed-traces` route** + Chronicle merge ([`feed-traces/route.ts`](../src/app/api/sessions/[id]/feed-traces/route.ts), [`merge-chronicle-feed.ts`](../src/lib/feed/merge-chronicle-feed.ts)).
6. [x] Revisit **actions limit** (120) vs UI needs; optional pagination.
7. [x] **Merge duplicate NPC queries** in `loadSessionStatePayload` into a single `npcStates` read + in-memory reuse.

### Phase C — Images (product parity)

8. [x] **Party:** Apply a **party automatic image budget** (reuse `chapter_system_*` columns or new fields) inside [`assertChapterImageBudget`](../src/server/services/chapter-runtime-service.ts) or parallel assert before `runImagePipeline`.
9. [x] **Optional:** Stricter [`visual-delta`](../src/lib/orchestrator/workers/visual-delta.ts) (e.g. require multiple reasons, or `priority === "high"`, or min turns since last image — pick one spec).

### Phase D — Quest & clarity

10. [x] **UI:** Add subtitle or tooltip on quest pill: mechanical **momentum** vs literal story completion.
11. [x] **Optional code:** Reduce `scoreFromRoll` deltas or add **per-chapter progress cap**; or gate `ready_to_end` on quest signal milestone (larger change).

### Phase E — NPC consistency

12. [x] **Canonical NPC matching:** Normalize labels (slug / alias map) before insert in `ensureNpcTargetsExist`; merge consequence targets to existing id.
13. [x] **Defaults:** New NPCs → `neutral` / `neutral` (or `unknown`) until hostile confirmed; update consequence/narration paths to set **hostile** when appropriate.
14. [x] **UI:** Filter [`CombatStrip`](../src/components/game/combat-strip.tsx) NPC list into **Foes** / **Allies** / **NPCs** using `attitude` / `role`.

### Phase F — Polish

15. [x] **100% + chaos:** Add short copy when `progress === 100` (ending vote open) explaining table can still fail forward narratively.
16. [x] **Re-run metrics (manual):** After deploy, note **Vercel** invocations/min on `/api/sessions/[id]/state`, `/party/phase-tick`, and **Supabase** Database egress for a typical multiplayer session; compare to your pre-change baseline or prior sprint. No automated job — dashboard snapshots suffice.

---

## Mapping: backlog section → TODO phase

| Backlog § | TODO phase |
|-----------|------------|
| §1 Multiplayer storms | A (items 1–4) |
| §2 Heavy payload | B (5–7) |
| §3 Scene images | C (8–9) |
| §4 Quest vs geography | D (10–11) |
| §5 Duplicate NPCs | E (12) |
| §6 Foes / hostile | E (13–14) |
| §7 Ending vote chaos | F (15) |
| §8 Infra | Deferred |
