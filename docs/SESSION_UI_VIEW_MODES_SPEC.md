# Session UI: Spotlight, View Modes & Chronicle — Full Specification

**Status:** Planning / implementation guide  
**Audience:** Engineers (human + AI agents) implementing UI without touching core gameplay or AI.  
**Branch policy:** All implementation work targets **`visual-overhaul`** (or a child branch) until reviewed; **`main`** stays stable until merge.

---

## Table of contents

1. [Purpose and guarantees](#1-purpose-and-guarantees)  
2. [What must never break](#2-what-must-never-break)  
3. [Current architecture (verified)](#3-current-architecture-verified)  
4. [Problem and product intent](#4-problem-and-product-intent)  
5. [View modes (definitions)](#5-view-modes-definitions)  
6. [Spotlight layout (Beat stack)](#6-spotlight-layout-beat-stack)  
7. [Chronicle (full log)](#7-chronicle-full-log)  
8. [Phase 1 — Safe implementation (no API / no Pusher contract changes)](#8-phase-1--safe-implementation-no-api--no-pusher-contract-changes)  
9. [Phase 2 — Optional structural upgrade (`turn_id`)](#9-phase-2--optional-structural-upgrade-turn_id)  
10. [State persistence and hydration caveats](#10-state-persistence-and-hydration-caveats)  
11. [Risks, mitigations, and forbidden edits](#11-risks-mitigations-and-forbidden-edits)  
12. [QA checklist (must pass before merge to main)](#12-qa-checklist-must-pass-before-merge-to-main)  
13. [Git workflow and rollback](#13-git-workflow-and-rollback)  
14. [Cursor rules compliance](#14-cursor-rules-compliance)  
15. [Master implementation checklist (step-by-step)](#15-master-implementation-checklist-step-by-step)  
16. [Appendix: File reference map](#appendix-file-reference-map)

---

## 1. Purpose and guarantees

### 1.1 Purpose

Deliver a **cooler, more game-native** presentation of Ashveil sessions by:

- Treating the **scene image + narrative** as the **stage**, not optional chrome.  
- Surfacing the **current beat** (who acted, what they said, latest dice summary, optional fate hints) **above** burying everything in a scroll-first chat log.  
- Letting users **choose** a layout: **Spotlight** (default), **Classic** (scroll-first feed), and later **Chronicle** (turn-grouped cards when `turn_id` exists).

### 1.2 Guarantees (what this document enforces)

| Guarantee | Meaning |
|-----------|---------|
| **G1** | The **AI orchestration pipeline**, **POST `/api/sessions/[id]/actions`**, **dice resolution**, **DB canonical state**, and **Pusher event semantics** remain behaviorally identical unless **Phase 2** is explicitly approved and implemented as a separate change set. |
| **G2** | **All** realtime updates continue to flow through **`useSessionChannel`** → **`useGameStore`** (`addFeedEntry`, `setNarrativeText`, etc.). No second parallel event pipeline for “Spotlight mode.” |
| **G3** | **Feed array** remains append-only from the same handlers; UI modes only **change where** feed is rendered (inline vs sheet vs grouped), not **whether** entries are created. |
| **G4** | Implementation is **reversible** via git branch; **`main`** is not merged until QA passes. |

---

## 2. What must never break

### 2.1 Server / AI (do not modify in Phase 1)

- [`src/lib/orchestrator/pipeline.ts`](../src/lib/orchestrator/pipeline.ts) — turn resolution, AI workers, dice, broadcasts from pipeline.  
- [`src/app/api/sessions/[id]/actions/route.ts`](../src/app/api/sessions/[id]/actions/route.ts) — action submission, `runTurnPipeline`, broadcasts.  
- [`src/server/services/turn-service.ts`](../src/server/services/turn-service.ts) — locks, `submitAction`, `advanceTurn`, `turn-started` broadcast.  
- Any **DM routes** under `src/app/api/sessions/[id]/dm/**` for human DM flows.

### 2.2 Client realtime (do not gut or duplicate in Phase 1)

- [`src/lib/socket/use-session-channel.ts`](../src/lib/socket/use-session-channel.ts) — must keep **all** `channel.bind(...)` handlers and **`addFeedEntry`** calls unless fixing an unrelated bug with explicit review.

**Allowed in Phase 1:**  
- No changes here **at all** (simplest).  
- Or **additive** optional fields on `FeedEntry` **only** when Phase 2 is in scope (not Phase 1).

### 2.3 Core UX that must keep working

- Submit action → thinking state → dice overlay → narration update → state/stat updates → quest UI → party strip HP → scene image pending/ready.  
- Human DM: `DmActionBar`, `awaiting-dm`, narrate / set DC / advance / event.  
- Leave session, reconnect hydrate via `GET /api/sessions/[id]/state`.

---

## 3. Current architecture (verified)

### 3.1 Gameplay shell

- **Route:** [`src/app/session/[id]/page.tsx`](../src/app/session/[id]/page.tsx)  
- **Rough vertical order today:**  
  `SceneTransition` → `ConnectionStatus` → sheets → `DiceOverlay` / `StatPopupOverlay` → **SceneHeader** (~42vh) → **NarrativeCard** → quest block → **FeedList** → **PlayerStrip** → **TurnBanner** + **ActionBar** / **DmActionBar**

### 3.2 Feed model

- **Type:** [`FeedEntry`](../src/lib/state/game-store.ts)  
- **Fields:** `id`, `type`, `text`, `timestamp`, optional `playerName`, `detail`, `highlight`, `imageUrl`, `statEffects`.  
- **Mutation:** `addFeedEntry` appends `feed: [...s.feed, entry]`.

### 3.3 Pusher events bound (realtime subscription surface)

From [`use-session-channel.ts`](../src/lib/socket/use-session-channel.ts):

`player-joined`, `player-ready`, `player-disconnected`, `session-started`, `turn-started`, `action-submitted`, `dice-rolling`, `dice-result`, `narration-update`, `state-update`, `stat-change`, `scene-image-pending`, `scene-image-ready`, `scene-image-failed`, `round-summary`, `awaiting-dm`, `dm-notice`.

**Important:** This is the **full set of channel bindings** for session UX. **Not every handler calls `addFeedEntry`.** Examples that update other store slices without appending a feed row: `scene-image-ready` (sets image + attaches to latest narration), `scene-image-failed` (clears pending + stops poll), `awaiting-dm` (sets DM-wait flags). Most social/system/narration paths **do** append via `addFeedEntry` — see handlers in the same file when auditing behavior.

### 3.4 Hydration (`GET /state`)

- [`src/app/api/sessions/[id]/state/route.ts`](../src/app/api/sessions/[id]/state/route.ts) builds **`feed` from `narrative_events` only** (last 20, chronological).  
- **Not** included on refresh: action lines, dice lines, most system lines from live play — only narrations.  
- **Implication:** Spotlight/Classic must tolerate “thinner” feed after reload; do not assume full action history exists in `feed` until a future API enhancement.

---

## 4. Problem and product intent

### 4.1 Problem

Even with richer **feed row styling**, the screen still **reads as a chat transcript** because the **dominant scroll region** is a linear list of messages.

### 4.2 Intent

- **Primary:** “**Stage + spotlight**” — scene and narrative stay central; **mechanics and intent** are visible in a **beat strip**; **full history** is **one tap away** (Chronicle).  
- **Secondary:** **User choice** — Classic mode for players who want scroll-first.  
- **Tertiary (later):** **Chronicle cards** grouped by turn when **`turn_id`** is plumbed (Phase 2).

---

## 5. View modes (definitions)

| Mode ID | Working name | Behavior |
|---------|----------------|----------|
| `spotlight` | **Spotlight** (default) | Scene + NarrativeCard + **BeatStrip** (derived from store) + compact “open Chronicle” control. Main column **not** dominated by `FeedList`. |
| `classic` | **Classic** | Current layout priority: **FeedList** remains prominent between narrative and party strip (same data as today). |
| `chronicle` | **Chronicle** (Phase 2+) | Full history rendered as **turn-grouped cards** when `turnId` exists on entries; fallback to Classic row renderer for entries without `turnId`. |

**Persistence:** `localStorage` key e.g. `ashveil.sessionUiMode` with values `spotlight | classic | chronicle`.  
**Scope:** Per browser / device until you add server-side prefs.

---

## 6. Spotlight layout (Beat stack)

### 6.1 BeatStrip — data sources (read-only from store)

Derive **display-only** fields (no new server fields in Phase 1):

| Element | Source |
|---------|--------|
| Active hero name | `session.currentPlayerId` + `players` (character name / displayName) — may match “whose turn” banner |
| Last action text | Latest `feed` entry with `type === "action"` (scan from end) |
| Last dice summary | Latest `feed` entry with `type === "dice"` and parseable final line OR use `diceOverlay` snapshot while visible |
| Last stat snapshot | Latest `type === "stat_change"` optional one-line summary |
| Narrative | Existing **`narrativeText`** + **`NarrativeCard`** (do not duplicate long text in BeatStrip; BeatStrip is **teaser** + labels) |

**Rule:** BeatStrip **subscribes** to the same store; it **never** intercepts Pusher.

### 6.2 Layout sketch (mobile-first)

1. SceneHeader (unchanged token-wise)  
2. NarrativeCard  
3. Quest (if any) — unchanged  
4. **BeatStrip** (new) — short, thumb-friendly  
5. **Chronicle affordance** — button opens `BottomSheet` or expands inline with `FeedList` inside  
6. PlayerStrip  
7. TurnBanner + ActionBar / DmActionBar  

### 6.3 Empty / edge states

- No action yet: BeatStrip shows neutral copy (“Awaiting the table…”) or hides.  
- After reload: feed may be narration-only — BeatStrip may only show narrative context; acceptable.

---

## 7. Chronicle (full log)

### 7.1 Behavior

- **Container:** Reuse [`FeedList`](../src/components/feed/feed-list.tsx) + [`FeedEntryRow`](../src/components/feed/feed-entry.tsx) inside a **BottomSheet** titled “Chronicle” (or inline expand).  
- **Data:** `useGameStore(s => s.feed)` — identical array in Classic and Spotlight.

### 7.2 Do not

- Do **not** maintain a **second** `feed` array.  
- Do **not** skip `addFeedEntry` in Spotlight “to reduce noise.”

---

## 8. Phase 1 — Safe implementation (no API / no Pusher contract changes)

### 8.1 In scope

- New components: e.g. `BeatStrip.tsx`, `SessionViewModeToggle.tsx` (or settings row).  
- [`session/[id]/page.tsx`](../src/app/session/[id]/page.tsx): conditional layout on `uiMode`.  
- Optional: small hook `useSessionUiMode()` reading/writing `localStorage`.  
- [`BottomSheet`](../src/components/sheets/bottom-sheet.tsx) integration for Chronicle.

### 8.2 Out of scope (explicit)

- Changing Zod event schemas in [`src/lib/schemas/events.ts`](../src/lib/schemas/events.ts).  
- Adding `turn_id` to broadcasts.  
- Changing `GET /state` feed shape (unless Phase 2).  
- Editing orchestrator or pipeline.

---

## 9. Phase 2 — Optional structural upgrade (`turn_id`)

**Only after Phase 1 is stable.**

- Extend `FeedEntry` with `turnId?: string` (and optionally `roundNumber`, `playerId`).  
- Add `turn_id` to **every** relevant `broadcastToSession` payload and update `use-session-channel` to pass through.  
- Implement `groupFeedIntoSegments` + `TurnChronicleCard` for `chronicle` mode.  
- Extend `GET /state` to map `narrative_events.turn_id` onto feed rows (and optionally rebuild richer history from DB).

**Separate spec risk:** missing one emitter breaks grouping — requires grep-driven audit.

---

## 10. State persistence and hydration caveats

| Scenario | Expected behavior |
|----------|-------------------|
| Live play | Full feed in memory from Pusher. |
| Page reload | `feed` from API = **narrations only**; BeatStrip may be sparse; NarrativeCard + scene still hydrate. |
| Mode switch | Instant; same `feed` array. |

Document in UI copy if needed: “Chronicle after refresh shows recent narrations; full action log is live-session only” until API is upgraded.

---

## 11. Risks, mitigations, and forbidden edits

| Risk | Mitigation |
|------|------------|
| Divergent behavior per mode | One store, two layouts; shared `FeedList` for any full log. |
| Missing events in one mode | Never conditional `addFeedEntry` on mode. |
| Layout breaks DM / quest | Test both `ai_dm` and `human_dm` + quest vote UI in both modes. |
| Hydration confusion | QA reload mid-session; document limitation. |

**Forbidden without explicit approval:** removing or splitting `useSessionChannel` effect, changing API bodies for actions, altering `runTurnPipeline` order.

---

## 12. QA checklist (must pass before merge to main)

- [ ] Create session, join 2 players, complete **full turn**: action → dice → narration → optional stat change.  
- [ ] **Spotlight:** BeatStrip updates; Chronicle sheet lists same events as Classic would.  
- [ ] **Classic:** layout matches prior behavior (feed visible without opening sheet).  
- [ ] **Toggle** modes mid-session; no duplicate or missing feed rows.  
- [ ] **Human DM** path: awaiting DM, narrate, advance (if applicable).  
- [ ] **Scene image** pending → ready still updates narrative attachment.  
- [ ] **Reload** page: session loads, no crash; modes persist from `localStorage`.  
- [ ] `npm run build` succeeds.  
- [ ] Manual smoke on **iOS safe area** (action bar padding).

---

## 13. Git workflow and rollback

1. Work on **`visual-overhaul`** (track `origin/visual-overhaul`).  
2. Small commits with clear messages (`feat(ui): spotlight beat strip`, etc.).  
3. Push branch; open PR when ready.  
4. **Rollback:** do not merge; or `git revert` merge commit on `main`; or reset branch to previous SHA.

**Do not** commit `.env.local` or secrets.

---

## 14. Cursor rules compliance

When implementing, agents must follow:

- [`.cursor/rules/ashveil-project.mdc`](../.cursor/rules/ashveil-project.mdc) — stack, patterns, no invented APIs.  
- [`.cursor/rules/auto-mode-playbook.mdc`](../.cursor/rules/auto-mode-playbook.mdc) — read before edit, verify imports.  
- [`.cursor/rules/design-system.mdc`](../.cursor/rules/design-system.mdc) — CSS variables, Liquid Obsidian, `min-h-dvh`.  
- Do **not** use React context for game state; use Zustand.  
- Use `@/` imports only.

---

## 15. Master implementation checklist (step-by-step)

Use this as the **authoritative todo list**. Check boxes in PR description or project tool as you go.

### Phase 0 — Preconditions

- [ ] **P0.1** Confirm current branch is **`visual-overhaul`** (`git branch --show-current`).  
- [ ] **P0.2** Pull latest `visual-overhaul` / rebase from `main` if needed (no force-push to shared main).  
- [ ] **P0.3** Read this document and [`session/[id]/page.tsx`](../src/app/session/[id]/page.tsx) once end-to-end.

### Phase 1A — Preferences hook (client-only)

- [ ] **P1A.1** Add `src/lib/state/session-ui-mode.ts` (or `hooks/use-session-ui-mode.ts`) with:  
  - type `SessionUiMode = "spotlight" | "classic"` (add `"chronicle"` only with Phase 2).  
  - `getSessionUiMode(): SessionUiMode` reading `localStorage`.  
  - `setSessionUiMode(mode)` writing `localStorage` + optional callback for React state.  
  - default **`spotlight`**.  
- [ ] **P1A.2** SSR-safe: on first paint, default to `spotlight` then `useEffect` sync from `localStorage` (avoid hydration mismatch).  
- [ ] **P1A.3** No imports from server-only modules.

### Phase 1B — BeatStrip component

- [ ] **P1B.1** Create `src/components/game/beat-strip.tsx` (`"use client"`).  
- [ ] **P1B.2** Subscribe to `useGameStore` selectors: `feed`, `session`, `players`, optionally `diceOverlay`.  
- [ ] **P1B.3** Implement `useMemo` to find **last** `action`, **last** `dice`, optional **last** `stat_change` from `feed` (scan from end).  
- [ ] **P1B.4** Visual design: use **design tokens** only (`var(--color-gold-rare)`, etc.); compact height; no new hex colors.  
- [ ] **P1B.5** Accessibility: semantic structure; don’t rely on color alone for success/fail.  
- [ ] **P1B.6** **Unit test optional:** pure function `getLastFeedEntryOfType(feed, type)` in `tests/unit/` if logic is non-trivial.

### Phase 1C — Chronicle sheet

- [ ] **P1C.1** Add state in `page.tsx` or small wrapper: `chronicleOpen` boolean.  
- [ ] **P1C.2** Render `BottomSheet` when open, title **“Chronicle”**, body = **`<FeedList entries={feed} />`**.  
- [ ] **P1C.3** Ensure sheet does not unmount Pusher subscription (subscription lives in parent — **do not** move `useSessionChannel` inside sheet).  
- [ ] **P1C.4** Close on backdrop; preserve scroll position if reopening (optional nice-to-have).

### Phase 1D — View mode toggle UI

- [ ] **P1D.1** Add `SessionViewModeToggle` component (ghost buttons or pill) near **Leave** or header row — **min 44px** touch targets.  
- [ ] **P1D.2** Toggling **Classic** ↔ **Spotlight** updates `localStorage` and local React state.  
- [ ] **P1D.3** Copy: short labels “Spotlight” / “Classic” (tooltip optional).

### Phase 1E — Page layout wiring

- [ ] **P1E.1** In [`session/[id]/page.tsx`](../src/app/session/[id]/page.tsx), branch on `uiMode`:  
  - **Spotlight:** insert `BeatStrip` after quest / before Chronicle trigger; **hide** inline `FeedList` or replace with single “Open Chronicle” CTA.  
  - **Classic:** keep **inline** `FeedList` as today; **optional** still show BeatStrip **collapsed** or hide — **pick one** and document in PR (recommend: Classic = no BeatStrip to avoid duplication).  
- [ ] **P1E.2** **Do not** duplicate `PlayerStrip`, `ActionBar`, `DmActionBar`, or `DiceOverlay`.  
- [ ] **P1E.3** Verify **human_dm** + **isDm** branch still shows `DmActionBar` correctly in both modes.  
- [ ] **P1E.4** Verify **quest** ending vote block remains usable in both modes.

### Phase 1F — Verification

- [ ] **P1F.1** `npm run build`  
- [ ] **P1F.2** Run through [§12 QA checklist](#12-qa-checklist-must-pass-before-merge-to-main)  
- [ ] **P1F.3** Commit with message prefix `feat(ui):` on **`visual-overhaul`**  
- [ ] **P1F.4** `git push origin visual-overhaul`

### Phase 2 — Turn Chronicle mode (optional, separate PR recommended)

- [ ] **P2.1** Spec + grep audit: all `broadcastToSession` sites for dice/narration/stat/action.  
- [ ] **P2.2** Extend `FeedEntry` + event schemas + handlers.  
- [ ] **P2.3** `groupFeedIntoSegments` + `TurnChronicleCard`.  
- [ ] **P2.4** `GET /state` feed mapping for `turn_id`.  
- [ ] **P2.5** Full QA + `npm run build`.

---

## Appendix: File reference map

| Concern | Path |
|---------|------|
| Gameplay page | `src/app/session/[id]/page.tsx` |
| Feed list | `src/components/feed/feed-list.tsx` |
| Feed row | `src/components/feed/feed-entry.tsx` |
| Store | `src/lib/state/game-store.ts` |
| Pusher | `src/lib/socket/use-session-channel.ts` |
| Events schemas | `src/lib/schemas/events.ts` |
| State API | `src/app/api/sessions/[id]/state/route.ts` |
| Actions API | `src/app/api/sessions/[id]/actions/route.ts` |
| Bottom sheet | `src/components/sheets/bottom-sheet.tsx` |
| Design tokens | `src/app/globals.css` |

---

**End of document.**  
For product roadmap context (auth, monetization, etc.), see [`PRODUCTION_ROADMAP.md`](../PRODUCTION_ROADMAP.md) at repo root.
