# WhatIfPlay preflight inventory (Phase 0)

**Purpose:** Handler and route map before UI work. **Do not change APIs when implementing design.**

**Generated:** 2026-04-04 — living doc; extend as new surfaces ship.

---

## P0.1 — App routes (`src/app/**/page.tsx`)

| Path | Role |
|------|------|
| `page.tsx` | Home: create/join session, mode, party (Falvos); Romana quick paths |
| `lobby/[code]/page.tsx` | Join via code, GET session, ready, start, premise PATCH, Pusher |
| `character/[sessionId]/page.tsx` | Hero create/import/preset → session |
| `session/[id]/page.tsx` | Play: actions, dice, feed, party UI |
| `session/[id]/display/page.tsx` | Cast/display view |
| `worlds/page.tsx`, `worlds/[slug]/page.tsx`, `worlds/submit/page.tsx` | Gallery, detail, UGC submit |
| `adventures/page.tsx` | Saved adventures |
| `profile/page.tsx` | Account, heroes |
| `auth/bridge/page.tsx`, `auth/upgrade/page.tsx` | Auth flows |
| `tutorial/page.tsx`, `tv/page.tsx` | Tutorial, TV |

---

## P0.2 — Component dirs (main surfaces)

`auth/`, `character/`, `dice/`, `dm/`, `display/`, `feed/`, `game/`, `lobby/`, `scene/`, `sheets/`, `ui/`, `worlds/`

---

## P0.3 — Shared primitives

- **UI:** `gold-button`, `ghost-button`, `glass-card` (if present), `pill-select`, `loading-skeleton`, `route-loading`, `toast`, `connection-status`
- **Sheets:** `bottom-sheet`, `character-sheet`, `journal-sheet`, `party-sheet`

---

## P0.4 — Homepage (`page.tsx`) — Falvos branch

| Control | Handler | `fetch` / navigation |
|--------|---------|----------------------|
| Create session | `handleCreate` / `handleCreateWithOptions` | `POST /api/sessions` with body: `mode`, `campaignMode`, `maxPlayers`, `adventurePrompt`, tags, `worldBible`, `artDirection`, optional `templateKey`, `partyTotalRounds`, `partyInstigatorEnabled`, `gameKind`, `worldSlug`, `acquisitionSource`, etc. |
| After create | same | `router.push` / `router.replace` → `/lobby/{code}` or `/session/{id}` (Romana inline quick play: ready + start + replace session) |
| Join | `handleJoinSubmit` | `POST /api/sessions/join` `{ joinCode }` → `router.push(/lobby/{code})` |
| Romana bridge | various | `POST /api/analytics/romana-bridge`, `POST /api/auth/bridge-token`, `window.location` to main app |

---

## P0.5 — Lobby / character / session (summary)

**Lobby:** `POST /api/sessions/join` on enter; `GET /api/sessions/{id}`; `POST .../ready`; `POST .../start`; `PATCH /api/sessions/{id}` premise; `PATCH` max_players; Pusher `session-*` events.

**Character:** Character CRUD via `src/app/api/characters/**` and session entry navigation (see `character/[sessionId]/page.tsx`).

**Session:** `POST /api/sessions/{id}/actions` (gold standard); dice, DM routes as existing; `useSessionChannel`; Zustand `game-store`.

---

## P0.6 — Party (main app)

Templates: `src/lib/party/party-templates.ts` (`falvos_party_v1`). APIs under `src/app/api/sessions/[id]/party/**` — **do not change contracts** during UX work.

---

## P0.7 — Worlds / adventures / profile

- Worlds: `GET /api/worlds`, fork via `POST /api/sessions` with `worldSlug` (or dedicated fork route — verify in `world-detail-client` / gallery client).
- Adventures / profile: read `profile/page.tsx`, `adventures/page.tsx` for `fetch` targets before editing UI.

---

## P0.8 — Copy sweep targets (user-visible; main app)

See grep results in repo for: `Falvos`, `portal`, `Ashveil` (display strings only), `Opening portal`, `Tune the portal`, `manifest` name, `not-found`, `route-loading`.

**Do not change:** `@ashveil.guest`, `falvos_party_v1`, `falvos.tutorial.complete` storage keys, `acquisitionSource` string values, internal template keys.

---

## Gate

Phase 1+ may proceed after this file exists and P0.1–P0.8 are covered at the summary level above.
