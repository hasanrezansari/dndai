## Deploying Falvos on `falvos.com` (Next.js 16 + NextAuth v5)

This repo is the Falvos game app (Next.js App Router). These steps assume a standard managed host (recommended: Vercel).

### 1) Domain + base URL
- **Production URL**: `https://falvos.com`
- Decide whether you will also serve `https://www.falvos.com` (optional). If yes, redirect one to the other at the platform level.

### 2) Required environment variables (production)
Set these in your hosting provider’s environment settings.

#### Auth (NextAuth)
- **`NEXTAUTH_SECRET`**: required (random 32+ bytes)
- **`NEXTAUTH_URL`**: `https://falvos.com`

#### Google OAuth (optional but recommended)
- **`GOOGLE_CLIENT_ID`**
- **`GOOGLE_CLIENT_SECRET`**

#### Pusher (realtime)
- **`PUSHER_APP_ID`**
- **`PUSHER_KEY`**
- **`PUSHER_SECRET`**
- **`PUSHER_CLUSTER`**
- **`NEXT_PUBLIC_PUSHER_KEY`**
- **`NEXT_PUBLIC_PUSHER_CLUSTER`**

#### Database (Postgres)
- **`DATABASE_URL`**

#### AI providers (at least one)
- **`OPENROUTER_API_KEY`** (if using OpenRouter)
- Any other provider keys your `AI_PROVIDER` setup expects (see `.env.example`).

### 3) Google OAuth console settings (for `falvos.com`)
In Google Cloud Console → OAuth Client:

- **Authorized JavaScript origins**
  - `https://falvos.com`

- **Authorized redirect URIs**
  - `https://falvos.com/api/auth/callback/google`

If you also support `www`, add:
- `https://www.falvos.com` (origin)
- `https://www.falvos.com/api/auth/callback/google` (redirect)

### 4) NextAuth routes in this app
This app uses the standard NextAuth handler:
- `src/app/api/auth/[...nextauth]/route.ts`

Guest→Google upgrade flow:
- `POST /api/auth/upgrade/prepare`
- `POST /api/auth/upgrade/complete`
- UI: `/auth/upgrade`

### 5) Post-deploy verification (quick checklist)
- **Home loads** at `falvos.com`
- **Guest play** works (auto-session)
- **Google sign-in** works (no callback mismatch)
- **Guest → Google upgrade** preserves session membership
- **Create session → lobby → start → session** works
- **Realtime updates** work (Pusher keys correct)

### 6) Common failure modes
- **Google callback mismatch**: `NEXTAUTH_URL` and Google redirect URI must match exactly.
- **Mixed `www` vs apex**: pick one canonical host and ensure both OAuth + platform redirect align.
- **Cookies blocked**: upgrade flow uses a short-lived httpOnly cookie (`falvos.upgrade_guest_id`); keep HTTPS on.

