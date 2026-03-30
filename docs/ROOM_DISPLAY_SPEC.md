# Room display (read-only TV)

Seated players mint a short-lived JWT and open a **read-only** `/session/[id]/display?t=…` URL on a second screen. That browser does not join as a party member (no `players` row, no `/disconnect` storms) but still receives **Pusher** events and the same **session state payload** shape as `GET /api/sessions/[id]/state`.

## Environment

| Variable | Purpose |
|----------|---------|
| `DISPLAY_TOKEN_SECRET` | HS256 key for display JWTs (preferred in production). |
| `NEXTAUTH_SECRET` | Fallback signing key if `DISPLAY_TOKEN_SECRET` is unset. |

Mint and verification fail closed if neither secret is set.

## Token

- Library: `jose`, algorithm **HS256**.
- Claims: `sub` = session UUID, `aud` = `ashveil-display`, ~24h TTL.
- **Never** send this token to write routes (actions, DM tools, etc.).

## HTTP

| Route | Auth | Behavior |
|-------|------|----------|
| `POST /api/sessions/[id]/display-token` | Session user must be a **session member** | Returns `{ token, expiresAt, path }`. |
| `POST /api/sessions/watch-display` | **Public** | Body `{ joinCode }` (strict **6** chars, lobby alphabet). Rate-limited per IP. Resolves a non-**ended** session by `join_code`, mints display JWT, returns `{ path }` for client redirect to `/session/[id]/display?t=…`. No `players` row. |
| `GET /api/sessions/[id]/display-state` | `?t=` or `Authorization: Bearer` | Verifies JWT; returns `SessionStatePayload` **without** mutating `players.is_connected` and **without** `session.joinCode` (room code stripped from TV-facing JSON). |
| `GET /api/sessions/[id]/state` | Session member | Updates `is_connected` for the caller, then same payload builder. |
| `POST /api/pusher/auth` | Cookie session **or** `Authorization: Bearer` display JWT matching the channel’s session | Authorizes `private-session-[sessionId]`. |

## Client

- Gameplay keeps the existing Pusher **singleton** (cookie auth).
- Display uses `createPusherClientWithDisplayAuth(token)` and **disconnects** on unmount.
- `useSessionChannel(id, { displayToken, participateInPresence: false })` uses `/display-state` and skips `beforeunload` / `pagehide` **disconnect** beacons.

## TV entry from marketing home

- Route **`/tv`**: large room-code field; POSTs to `watch-display` then full-page navigates to the returned `path` (so the TV never has to type UUID or raw JWT).
- **Shared secret** is the same **`join_code`** shown in lobby/gameplay UI. Anyone who knows the code can open read-only display — mitigate with **Upstash rate limit** on `watch-display` (`ratelimit:watch-display`); optional future hardening: opaque short links.

## Auth gate

Paths matching `/session/[uuid]/display` with a **three-segment** `t` query param bypass the guest sign-in wall so a cold TV browser can render without a `players` row.

## QA

- [ ] Member gameplay still hydrates from `/state` and updates presence.
- [ ] TV with `?t=` loads without gate; no `POST …/disconnect` when closing the TV tab (verify network).
- [ ] Expired or wrong-session token → 403 on `display-state` and Pusher auth.
- [ ] Revoked secret invalidates new verifications (expected).
- [ ] `/tv` + valid room code → display; ended session → 404; bad code format → 400; rate limit → 429.
