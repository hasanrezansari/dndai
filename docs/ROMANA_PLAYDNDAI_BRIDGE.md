# PlayRomana ↔ playdndai bridge

**Purpose:** Clarify how a logged-in user moves from the PlayRomana deployment to the main playdndai app without losing account continuity.

## Auth / cookies

- Each deployment has its **own origin** and therefore **separate cookies** for NextAuth session.
- **`POST /api/auth/bridge-token`** (PlayRomana, authenticated): mints a short-lived one-time token stored in Postgres (`auth_bridge_tokens`), returns a `redirectUrl` pointing at **`MAIN_APP_ORIGIN`** (or `NEXT_PUBLIC_MAIN_APP_ORIGIN` fallback) with path `/auth/bridge?token=…&returnTo=…`.
- The **main app** consumes the token at `/auth/bridge`, attaches the session, and redirects to `returnTo` (default `/adventures`).

## Client links to the main app

- **`NEXT_PUBLIC_MAIN_APP_ORIGIN`**: use on PlayRomana builds for **in-browser links** (e.g. “More worlds”) when the main app URL must be known at build time. Falls back to `https://playdndai.com` if unset.
- **`MAIN_APP_ORIGIN`**: server-side default for bridge-token URL construction (see `src/app/api/auth/bridge-token/route.ts`).

## Analytics

- **`POST /api/analytics/romana-bridge`**: optional body `{ destination?: string }`. Emits a structured log line `romana_bridge_click` (see `src/lib/analytics/server-events.ts`). Includes `user_id_hash` when the caller is signed in.
- The PlayRomana home screen fires this before **Open full app (saved games)** (bridge token) and when opening **More worlds (playdndai)** (direct link to `/worlds`).

## Worlds catalog

- Published worlds live on the **main app** (`GET /api/worlds`, `POST /api/worlds/[slug]/fork`). PlayRomana links there for “more worlds”; starting a world still creates a session on whichever host handles the API request—**product should deploy catalog + fork on the app where sessions should live** (typically playdndai).
