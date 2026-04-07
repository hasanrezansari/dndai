# WhatIfPlay — Main app UX/UI design overhaul

**Status:** Living implementation spec — follow this document before writing UI code.  
**Domain intent:** `playdndai.com` → **whatifplay.com** (configuration and metadata; no gameplay change).  
**Research inputs:** `WhatIfPlay_UIUX_Revamp_Spec_L1.md`, `WhatIfPlay_Cursor_L2_Changes_File.md` (author’s originals; this file is the **repo-canonical** program).

**What this is:** A **full visual and UX overhaul** of the **main app** (default **Falvos** build). **Not** a mechanics, API, or schema rewrite.

**What this is not:** A greenfield redesign, new gameplay features invented by agents, **new API routes or server behavior**, new client state libraries, or changes to PlayRomana’s product shell in this phase. **UI structure** (tabs, sections, sheets) may change **inside existing routes** as long as §5a flow and §1 handler rules hold.

---

## 1. Paste this before any implementation (agent hard rules)

Use the block below as the first message context for Cursor / any auto agent working on this project.

```md
You are revamping the UI/UX of an existing Next.js multiplayer AI storytelling game.

Hard rules — DO NOT VIOLATE:
- Do not change any backend logic, API route handlers, request/response shapes, or Zod schemas used on the wire.
- Do not change game rules, dice logic, turn resolution, or orchestration behavior.
- Do not change multiplayer synchronization (Pusher events, channel names, payload shapes).
- Do not change session flow order: mode → create/join → lobby → character → session → play loop.
- Do not change hero/session data contracts or database schema except display-only metadata if explicitly approved.
- Do not introduce a new client state library; use existing Zustand store patterns only.
- Do not invent host capabilities, new lobby powers, or new configuration that has no existing API.
- Do not add **new App Router routes** (`src/app/.../page.tsx`) or standalone marketing pages unless product explicitly approves and Phase 0 inventory is updated — agents default to **no new routes**.
- **Allowed without new routes:** Re-layout inside existing pages (tabs, steps, drawers, sheets, accordions) that call the **same** handlers and preserve the **same** mandatory flow order (§5a).
- Do not rename internal state variables or API payload keys unless you can prove zero behavioral change; prefer label/copy changes only.

Brand and copy (main app / Falvos build only):
- Platform name: **WhatIf** (replace Falvos on main build surfaces only; see §3). Public site domain may be **whatifplay.com**; do not use “WhatIfPlay” as the product wordmark.
- Do not use RezPez as host or presenter (forbidden framing).
- Do not force every story/session title to start with “What if”; use “what if” on marketing/discovery surfaces only.

Implementation approach:
- Preserve every existing fetch() URL, method, and JSON body shape.
- Preserve router.push destinations and link hrefs.
- Prefer presentational refactors: layout, CSS, composition, copy; keep handlers wired to the same functions.
- Read the file before editing; search for existing patterns before creating files.
- Main app only: if getBuildTimeBrand() === "playromana", do not change that branch’s UI/copy/layout (PlayRomana deferred).

Quality bar:
- Premium, restrained, mobile-first; story and scene imagery are visually primary; UI supports readability.
- Avoid generic “AI SaaS” aesthetics: excessive gradients, neon clutter, stock illustration tropes, or novelty body fonts.
```

---

## 2. Anti-hallucination checklist (agents must self-audit)

Before opening a PR or ending a session, confirm **all** of the following.

- [ ] I did **not** add a new API route or change an existing handler’s validation (including auth, profile, characters, sessions, images).
- [ ] I did **not** change keys inside objects sent to `fetch()` or received from APIs.
- [ ] I did **not** add new required env vars or feature flags without product sign-off.
- [ ] I did **not** create duplicate components that bypass `@/components/ui` without reason.
- [ ] I did **not** edit `playromana` branches in `page.tsx`, `lobby/[code]/page.tsx`, `auth-gate.tsx`, or Romana-specific flows.
- [ ] I did **not** change global CSS in a way that restyles PlayRomana until `data-app-skin` (or equivalent) scoping exists (§6).
- [ ] Every button or link I touched still calls the **same** function or `href` as before (or a thin wrapper that only changes className).
- [ ] I ran or listed manual regression steps for the surfaces I touched (§12).

If any item is unchecked, **stop** and fix scope.

---

## 3. Scope: main app vs PlayRomana (verified)

| Build | How | This overhaul |
|--------|-----|----------------|
| **Main app** | Default: `NEXT_PUBLIC_BRAND` unset or not `playromana` | **In scope** — full UX/UI |
| **PlayRomana** | `NEXT_PUBLIC_BRAND=playromana` | **Out of scope** — do not change Romana-specific UI/copy/layout branches |

**Source of truth:** `src/lib/brand.ts` — `getBuildTimeBrand()`.

**Files that already branch on brand** (do not blur Romana when editing):

- `src/app/page.tsx`
- `src/app/lobby/[code]/page.tsx`
- `src/app/layout.tsx`
- `src/components/auth/auth-gate.tsx`
- `src/lib/party/party-templates.ts`

**Party mode and worlds on the main app:** **In scope** — same design tokens and UI primitives as campaign; **no** changes to `src/app/api/sessions/**` contracts unless a separate approved project says so.

---

## 4. Product identity (ideation — do not reinterpret)

The product is **not** “a fantasy adventure app.” It is a **multiplayer creative world**: tables bring **any** premise; the shell stays **genre-neutral**, **readable**, and **social** (who is in the room, whose turn, what happened).

- **Do** foreground user-chosen premise, scene art, and feed narrative.
- **Do not** hard-lock copy, icons, or empty states to medieval fantasy unless the **current session** content is fantasy.
- **Typography:** `.text-fantasy` remains a **font-family token only** (see `.cursor/rules/ashveil-project.mdc`) — not a genre statement.

---

## 5. Non-negotiables (gameplay and logic)

The following must remain **behaviorally identical** (L1 §1, L2 Step 1):

- Session creation and join-by-code behavior and endpoints.
- Lobby join code, readiness, start transitions.
- Character creation, import, preset selection, attachment to session.
- In-session action submission, dice, success/failure display, AI continuation, turn order.
- Scene/image generation **trigger points** (timing and API usage — not visual framing).
- Pusher/realtime flow and event handling.
- Zustand `src/lib/state/game-store.ts` semantics.
- **Authentication:** NextAuth configuration, sign-in/sign-out, session cookies, `auth-gate` gating rules, auth bridge/upgrade **flows** — styling and copy may change; **behavior** (who can reach which route, guest vs full user) must not regress.
- **Profile and saved heroes:** List/create/update heroes, portrait flows, and any `fetch` to `src/app/api/profile/**` or `src/app/api/characters/**` — same contracts and outcomes.
- **Image pipeline (server):** Orchestrator/image worker, `src/app/api/sessions/**/image*`, scene-image serving, and async `after()` usage — **no** changes as part of this UX project; only how images are **framed or laid out** in React.

### 5a. Canonical session lifecycle (must not be skipped or reordered)

This is the **core loop** the UI may reorganize visually but must **not** break:

1. User is authenticated or guest as today (Google or other providers via NextAuth — unchanged).
2. Create session (`POST /api/sessions`) or join (`POST /api/sessions/join`) → navigate to `/lobby/[code]` (or Romana quick paths unchanged).
3. Lobby: ready/start/copy/premise edits **only** via existing APIs.
4. Start → `/character/[sessionId]` or `/session/[id]` exactly as **current** server responses dictate (campaign vs party vs quickPlay).
5. Character completion → enter session route as today.
6. In-session: actions, rolls, narration, images, turns — same client triggers and server outcomes.

**Worlds fork:** If UI starts from worlds gallery, it must keep using existing `fork` / `POST /api/sessions` with `worldSlug` (or current pattern) — no parallel “fake” session creation.

---

## 6. Brand-scoped CSS (required first technical change)

`src/app/globals.css` is shared by **both** builds. **Forbidden:** replacing global design tokens without scoping so PlayRomana accidentally inherits WhatIfPlay skin.

**Required approach:**

1. Set a root attribute or class from `src/app/layout.tsx` based on `getBuildTimeBrand()`, e.g. `data-app-skin="whatifplay"` for main app and `data-app-skin="playromana"` for Romana (exact values are implementation details; **scoping is mandatory**).
2. Define **new** main-app token overrides under `[data-app-skin="whatifplay"]` (or chosen name).
3. Keep Romana on existing tokens until a future Romana redesign explicitly migrates.

No gameplay logic belongs in this step — **layout + CSS only**.

---

## 7. Master todo list (check off as you go)

Use this as the project checklist. **Order matters.**

### Phase 0 — Preflight (no visual “revamp” yet)

- [x] **P0.1** List every route under `src/app` that renders UI (see §8).
- [x] **P0.2** List every directory under `src/components` that main app pages import.
- [x] **P0.3** List shared primitives under `src/components/ui` and `src/components/sheets`.
- [x] **P0.4** For **homepage** (`page.tsx` Falvos branch): document each CTA → handler → `fetch` URL + method + critical body fields → `router.push` target.
- [x] **P0.5** Same for **join flow**, **lobby** (ready/start/copy/share), **character** (preset/import/create/continue), **session** (action submit, dice, sheets).
- [x] **P0.6** Same for **party** UI entrypoints (main app) → `party` API routes used.
- [x] **P0.7** Same for **worlds** (gallery, detail, fork) and **adventures** / **profile** as applicable.
- [x] **P0.8** Grep and list **user-visible** strings to change: Ashveil, Falvos (main only), portal/ritual language, “dungeon master” where spec says narrator — **file:line** list.
- [x] **P0.9** Write the inventory into a short appendix (same repo: optional `docs/WHATIFPLAY_PREFLIGHT_INVENTORY.md` or a section at the bottom of this file).

**Gate:** Do not start Phase 1 until P0.1–P0.8 exist in writing.

### Phase 1 — Scoped tokens + layout hook

- [x] **P1.1** Implement root skin attribute in `layout.tsx` (§6).
- [x] **P1.2** Add WhatIfPlay token block under main-app skin (midnight base, indigo/violet depth, **sparing** cyan accent, gold/orange primary CTA — L1 §9; reconcile with Liquid Obsidian variables).
- [ ] **P1.3** Verify PlayRomana build still matches **pre-change** visuals (side-by-side or screenshot diff).

### Phase 2 — Shared UI primitives

- [x] **P2.1** Update `src/components/ui/*` to use scoped tokens (buttons, cards, inputs, pills, toasts, loaders).
- [x] **P2.2** Align `src/components/sheets/*` to same tokens (character/party/journal sheets).
- [x] **P2.3** Touch targets and focus states: aim ≥44px where primary actions apply (L1 §14).

### Phase 3 — Home `src/app/page.tsx` (Falvos only)

- [x] **P3.1** Hero: WhatIfPlay + open-genre promise; primary CTA scrolls/focuses setup (L1 §6A).
- [x] **P3.2** Mode cards: **same** underlying `mode` state and handlers.
- [x] **P3.3** Story setup labels: align to §9 copy table; internal field names unchanged unless proven safe.
- [x] **P3.4** Create / Join actions: same endpoints and navigation.
- [ ] **P3.5** Regression: create session, join session, party mode path if exposed on home.

### Phase 4 — Lobby `src/app/lobby/[code]/page.tsx` (non-Romana UI)

- [x] **P4.1** Zones: header, join code/share, roster, setup summary, actions (L1 §6B).
- [x] **P4.2** No new host powers; only style/relabel existing controls.
- [x] **P4.3** Replace portal/ritual copy on main app surfaces per §9.
- [ ] **P4.4** Regression: ready, start, copy code, premise edit **only if** already in code.

### Phase 5 — Character `src/app/character/[sessionId]/page.tsx`

- [x] **P5.1** Presentational structure: saved heroes / presets / create (tabs or sections — no schema change).
- [ ] **P5.2** Regression: preset, import saved, new hero, enter session.

### Phase 6 — Session `src/app/session/[id]/page.tsx` + party UI components

- [x] **P6.1** Layers: top status, scene, feed, composer (L1 §6D).
- [x] **P6.2** Visually separate narration / player action / roll outcome / system (L1 §13).
- [x] **P6.3** Party panels: same tokens; **no** API contract changes.
- [ ] **P6.4** Regression: submit action, roll, turn change, multiplayer sync, party submit/vote if used.

### Phase 7 — Worlds, adventures, profile, auth-adjacent

- [x] **P7.1** `src/app/worlds/**` + `src/components/worlds/**` — cards, rails, detail, submit.
- [x] **P7.2** `src/app/adventures/page.tsx`.
- [x] **P7.3** `src/app/profile/page.tsx`.
- [x] **P7.4** `src/components/auth/auth-gate.tsx` — **main app paths only**; preserve guest/session logic.
- [x] **P7.5** `src/app/auth/bridge/page.tsx`, `src/app/auth/upgrade/page.tsx` — styling only.
- [x] **P7.6** `src/app/session/[id]/display/page.tsx`, `src/app/tutorial/page.tsx`, `src/app/tv/page.tsx` if shipped on main app.

### Phase 8 — System routes and metadata

- [x] **P8.1** `loading.tsx`, `error.tsx`, `not-found.tsx` — main-app skin.
- [x] **P8.2** `layout.tsx` metadata: WhatIfPlay title/description for **main app**; **unchanged** for PlayRomana branch.
- [x] **P8.3** When domain is live: `src/lib/site-url.ts`, `src/lib/main-app-public.ts`, `NEXTAUTH_URL` / env docs — **config only**, no API changes. *(JSDoc + `.env.example` document whatifplay.com; runtime defaults unchanged until env is set.)*

### Phase 9 — Final verification sweep

- [ ] **P9.1** Run full checklist §12.
- [x] **P9.2** Grep: no forbidden strings on product-critical surfaces (§9, §10). *(Last pass: `Opening portal…` is **PlayRomana-only**. Tutorial opening copy and final-chapter default title updated to neutral wording. Remaining **Ashveil** strings are mostly **OpenRouter `X-Title`** headers and internal identifiers — optional cleanup.)*
- [x] **P9.3** Document “changed / intentionally unchanged / risks” (L2 Step 10). *(See §18.)*

---

## 8. Surface map — exact app routes (`page.tsx`)

| Route | Path |
|--------|------|
| Home | `src/app/page.tsx` |
| Lobby | `src/app/lobby/[code]/page.tsx` |
| Character | `src/app/character/[sessionId]/page.tsx` |
| Session | `src/app/session/[id]/page.tsx` |
| Session display | `src/app/session/[id]/display/page.tsx` |
| Worlds gallery | `src/app/worlds/page.tsx` |
| World detail | `src/app/worlds/[slug]/page.tsx` |
| World submit | `src/app/worlds/submit/page.tsx` |
| Adventures | `src/app/adventures/page.tsx` |
| Profile | `src/app/profile/page.tsx` |
| Auth bridge | `src/app/auth/bridge/page.tsx` |
| Auth upgrade | `src/app/auth/upgrade/page.tsx` |
| Tutorial | `src/app/tutorial/page.tsx` |
| TV | `src/app/tv/page.tsx` |

API tree: `src/app/api/**` — **read-only for this project** unless an emergency bugfix is explicitly approved outside this overhaul.

---

## 9. Copy mapping (labels only — prefer no key renames)

| Avoid (main app product shell) | Preferred direction |
|--------------------------------|---------------------|
| Ashveil / obsidian-core lore branding | WhatIf |
| Falvos (display name on main build) | WhatIf |
| “AI Dungeon Master” / “Human Dungeon Master” (tone) | AI Narrator / Human Narrator |
| “Select Master Presence” | Choose how to play / Who runs this table? |
| “The Narrative Seed” (if used as label) | Story prompt |
| “Fellowship count” | Player count |
| “Create Session” | Create story |
| “Enter Portal” / “Opening portal…” | Join story / Continue / plain loading |
| “Summoning ritual” | Join with code |
| Heavy portal/scroll/cipher metaphor on core setup | Neutral, genre-inclusive language |

**“What if” rule:** Homepage, discovery, onboarding hooks — **yes**. User-defined session/story/hero names and in-game feed labels — **no forced prefix**.

**Internal code** (`@ashveil.guest`, `ASHVEIL_INTERNAL_METRICS`, `sessionStorage` keys): changing these is **not** required for UX; treat as optional tech cleanup **separate** from this overhaul to reduce risk.

---

## 10. Forbidden / allowed (brand)

**Required (main app visible UI):** Platform name **WhatIf** (domain **whatifplay.com** is URLs only, not the on-screen product name).

**Forbidden:**

- RezPez as host (“invites you”, “hosted by”, “presents”).
- Fantasy-only lore wrapper on **core** setup/play surfaces.
- Forcing “What if …” on every scenario title.

**Allowed:** “What if” in marketing/discovery/examples; user-chosen titles unrestricted.

---

## 11. Visual system (constrained ideation)

Align with **Liquid Obsidian** (see `.cursor/rules/ashveil-project.mdc` and `globals.css`) and L1 §9:

- **Feel:** Modern game platform, cinematic, social, premium, **mobile-first**.
- **Palette:** Deep midnight base; indigo/violet depth; **sparing** electric cyan accent; warm gold/orange for **primary** CTA.
- **Surfaces:** Rounded panels, subtle border glow, layered depth, **image-forward** cards for scenes/worlds.
- **Motion:** Minimal, polished — hover lift, soft scene transitions; **no** decorative shimmer loops unless tied to existing product meaning.

**Banned aesthetic drift:**

- Generic chatbot UI (bubbles-as-default layout for non-chat surfaces, excessive “AI” badges).
- Rainbow gradients, neon noise, or cluttered HUD on narrative screens.
- Illegible display fonts for body text.

---

## 12. Final verification checklist (must pass before “done”)

- [ ] **Auth:** Sign in with Google (or configured providers); sign out; guest path if applicable; protected routes still enforce access (`auth-gate`).
- [ ] Homepage creates sessions (same API as before).
- [ ] Homepage joins sessions by code.
- [ ] Lobby loads by code; ready/start/copy behave as before.
- [ ] Character: preset, saved import, create new, enter session.
- [ ] **Profile / saved heroes:** Open profile; list heroes; save or update a hero if the flow exists; no broken `fetch` to profile/characters APIs.
- [ ] Session: prompt/action submission, dice, outcomes, narration advance.
- [ ] **Scene images:** Still load/update as before (layout may change; URLs and timing of requests unchanged from player perspective).
- [ ] Turn order and non-active player disabled state correct.
- [ ] Multiplayer / Pusher sync still works.
- [ ] Party mode (main app): submit/vote/merge UX still works if enabled.
- [ ] Worlds fork/gallery still works if used.
- [ ] No RezPez host language.
- [ ] No Ashveil/Falvos **product** naming on main app critical surfaces (world names inside fiction may still say anything).
- [ ] “What if” appears selectively, not on every title/label.
- [ ] If UI was split into tabs/sections: every critical action still reachable; **no** dead ends that skip lobby, character, or session when the server expects them.

---

## 13. After each phase (L2 Step 10)

Deliver a short note (PR description or changelog entry):

1. What changed (files + user-visible effect).
2. What was **intentionally not** changed.
3. Logic-risk areas touched (should be “none” or “copy only”).
4. Regression steps run.
5. Recommended next phase.

---

## 14. Optional component naming (non-binding)

L1/L2 suggest presentation names (e.g. `LobbyHeader`, `StoryFeed`). **Do not rename** files aggressively unless it improves clarity; **no** rename is required for correctness.

---

## 15. Key reference files (read before editing)

| Area | Files |
|------|--------|
| Brand | `src/lib/brand.ts`, `src/lib/copy/ashveil.ts` |
| URLs | `src/lib/site-url.ts`, `src/lib/main-app-public.ts` |
| Layout / tokens | `src/app/layout.tsx`, `src/app/globals.css` |
| Game state | `src/lib/state/game-store.ts` |
| Realtime | `src/lib/socket/use-session-channel.ts`, `src/lib/socket/server.ts` |
| Session API pattern | `src/app/api/sessions/[id]/actions/route.ts` |
| Project rules | `.cursor/rules/ashveil-project.mdc`, `.cursor/rules/auto-mode-playbook.mdc` |

---

## 16. Summary

This document **constrains** the WhatIfPlay overhaul to **main-app-only** visual and UX work, **preserves** all gameplay and API behavior, **protects** the PlayRomana build via **scoped CSS** and **branch discipline**, and **extends** the same design language to **party mode, worlds, adventures, profile, and auth** surfaces. Phases and todos are ordered so agents **cannot** skip inventory and token scoping without breaking Romana or logic. **Paste §1** at the start of every implementation session; use §2 before merge.

When Phase 0 is complete, implementation may proceed phase-by-phase with §12 as the release gate.

---

## 17. Audit note (document vs. your “core loop” requirement)

**Verdict:** With §1, §5 (expanded), §5a, and §12 (expanded), this spec **does** confine work to UX/UI while protecting session creation, join, lobby, character, in-session mechanics, realtime sync, **auth**, **profile/heroes**, and **image pipeline behavior**. Visual changes to **how** images appear (frames, aspect, loading placeholders) are allowed; changing **when** or **whether** the server generates them is out of scope and forbidden here.

**Resolved tension:** Earlier text forbade “new routes” broadly; it now matches **your** intent: **new App Router pages** are off-limits by default, but **tabs/sections/sheets inside existing pages** are explicitly allowed if the **same handlers** and **§5a order** are preserved.

**Residual risk (process, not doc):** An agent could still break logic by editing a handler while “restyling.” Mitigation: **Phase 0 handler maps**, §2 checklist, and code review focused on **diffs touching `fetch` bodies and `router.push`**.

---

## 18. Phase 9 — Changed / unchanged / risks (agent log, 2026-04-04)

**Changed (user-visible / styling):** Scoped tokens under `html[data-app-skin="whatifplay"]`, shared `--border-ui*`, main-app copy via `brand.ts` / `copy/ashveil.ts`, home / lobby / character / session shell / worlds / profile / adventures / feed / party UI / auth gate presentation (including OAuth banner, guest name field, GlassCard borders, Google handoff spinner copy). **Session play:** clearer vertical layers (scene `header`, status strip, `section` for feed, sticky `footer` for composer + safe-area). **Wire copy (display-only defaults):** tutorial opening no longer says “Falvos”; final-chapter fallback title `"Your story"` instead of `"Ashveil Chronicle"`. **Domain cutover:** JSDoc on `site-url.ts` / `main-app-public.ts` and `.env.example` lines for `whatifplay.com`. **Product name:** user-facing **WhatIf** (domain **whatifplay.com** is not the wordmark). **Readability / home IA:** brighter text tokens, full-page atmosphere, mode cards directly under hero, “How it works” + lead copy in a `<details>` block.

**Intentionally unchanged:** All `fetch` URLs, methods, JSON bodies, Pusher payloads, Zustand semantics, PlayRomana-specific UI branches and copy, internal identifiers (`@ashveil.guest`, template keys). Default public origins in code fall back to `whatifplay.com` when env is unset (production should still set `NEXTAUTH_URL` / `NEXT_PUBLIC_SITE_URL` explicitly). OpenRouter `X-Title` headers may still say Ashveil (optional rename).

**Risks:** Manual §12 regression and **P1.3** Romana screenshot diff still required before calling the program “done.”
