# Room display (TV) — specification

**Status:** Implemented — `/session/[id]/display`  
**Audience:** Engineers maintaining the optional big-screen surface.

## Purpose

Optional **cinema mode** for a TV or shared browser: **scene image + AI narration only**. Phones keep the full session (Chronicle / Spotlight / Classic, feed, actions). The display route is **not** a phone view mode and does not read `sessionUiMode` storage.

## Guarantees

- Same realtime pipeline as gameplay: [`useSessionChannel`](../src/lib/socket/use-session-channel.ts) → [`game-store`](../src/lib/state/game-store.ts). No second Pusher binding layer.
- No changes to orchestration, `/actions`, or turn services for this feature (Milestone A).
- Pusher auth still requires a logged-in user with a `players` row for the session ([`/api/pusher/auth` routes](../src/app/api/pusher/auth/route.ts)).

## Out of scope on the display page

- Feed list, BeatStrip, Chronicle, dice overlay, party strip, quest, turn banner, ActionBar, DM bar, sheets.
- Replacing or switching phone UI to “TV mode.”

## QA

- **Phone:** Full loop unchanged; entry is an extra link only.
- **Display:** Image and narration update live; no player action text; read-only.
- **Reload display:** Rehydrates from `/state` + events; same limitations as thin narration history for past Pusher-only rows.

## Future (optional)

- Display-only subscribe token + QR (narrow auth; no write access).
