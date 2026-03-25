# ASHVEIL — Production Launch Roadmap

> Current status: Core gameplay loop is working (Phases 0-14 complete). This document charts everything needed to take Ashveil from working prototype to marketable, monetized product.

---

## How to Use This Document

This roadmap is designed for AI-assisted development with Cursor auto mode. Each phase is self-contained with:
- **Goal**: what this phase achieves
- **Files to create/modify**: exact paths
- **DB changes**: new tables or columns needed
- **Acceptance criteria**: how to verify the phase is done
- **Dependencies**: what must be done first

**Workflow for each phase:**
1. Tell auto: "Implement Phase N from PRODUCTION_ROADMAP.md"
2. Auto reads this file + the cursor rules, then executes
3. After completion: `npm run build && npm test` to verify
4. Review the changes before moving to the next phase

**Priority order**: Phases 15-17 are critical path (auth, onboarding, monetization). Phases 18-20 unlock growth. Phases 21-24 are polish and scale.

**Mobile gameplay shell (session layout, Spotlight / Chronicle / Classic):** see [`docs/MOBILE_GAMEPLAY_SHELL.md`](docs/MOBILE_GAMEPLAY_SHELL.md) — phased plan (M1–M4) and pointer to [`docs/SESSION_UI_VIEW_MODES_SPEC.md`](docs/SESSION_UI_VIEW_MODES_SPEC.md).

---

## Phase 15: Authentication & User Accounts

**Goal**: Replace guest-only auth with proper OAuth while keeping guest mode for quick onboarding.

### 15.1 OAuth Providers
Add Google and Discord OAuth (primary gamer audience) to NextAuth config.

**Files to modify:**
- `src/lib/auth/config.ts` — add Google and Discord providers alongside existing Credentials (Guest)
- `.env.local` / `.env.example` — add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`

**Implementation:**
```typescript
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
// Add to providers array alongside existing Credentials provider
```

### 15.2 Guest Gating
Allow guests to play 1 free session, then require sign-up.

**DB changes:**
- Add `guest_sessions_used` integer column to `users` table (default 0)
- Add `is_guest` boolean column to `users` table (default false)

**Files to modify:**
- `src/lib/db/schema.ts` — add columns to `authUsers`
- `src/lib/auth/config.ts` — set `is_guest: true` in Credentials authorize
- `src/lib/auth/guards.ts` — add `requirePaidOrFirstSession()` guard
- `src/app/api/sessions/route.ts` — check guest session limit before creating

### 15.3 Account Linking (Guest -> Full Account)
When a guest signs up with OAuth, merge their guest data.

**Files to create:**
- `src/server/services/account-service.ts` — `linkGuestToOAuth(guestUserId, oauthUserId)`: transfer players, sessions, characters
- `src/app/api/auth/link/route.ts` — endpoint to trigger account merge

### 15.4 User Profile
Display name, avatar (from OAuth or custom), play stats.

**DB changes:**
- Add `avatar_url` text column to `users`
- Add `games_played` integer, `games_hosted` integer to `users`

**Files to create:**
- `src/app/profile/page.tsx` — profile view/edit page
- `src/components/auth/user-avatar.tsx` — avatar component (OAuth image or initials fallback)
- `src/app/api/profile/route.ts` — GET/PATCH profile

### 15.5 Auth Gate Upgrade
Update the auth gate UI to show OAuth buttons alongside guest mode.

**Files to modify:**
- `src/components/auth/auth-gate.tsx` — add "Sign in with Google" and "Sign in with Discord" buttons above the guest name input. Style with Liquid Obsidian design system. Show "or continue as guest" below OAuth options.

**Acceptance criteria:**
- [ ] User can sign in with Google OAuth
- [ ] User can sign in with Discord OAuth
- [ ] Guest mode still works with display name entry
- [ ] Guest gets 1 free session, then sees "sign up to continue" prompt
- [ ] Guest who signs up with OAuth keeps their session/character data
- [ ] Profile page shows name, avatar, games played
- [ ] `npm run build` passes, `npm test` passes

**Dependencies:** None (first phase)

---

## Phase 16: Onboarding / Demo Adventure

**Goal**: Let new players experience Ashveil immediately with a free, low-cost tutorial adventure before requiring sign-up or payment.

### 16.1 Tutorial Session Type
A special solo session mode that uses pre-scripted AI prompts to minimize API costs.

**DB changes:**
- Add `"tutorial"` to `SessionModeSchema` enum in `src/lib/schemas/enums.ts`
- Add `is_tutorial` boolean column to `sessions` table

**Files to create:**
- `src/lib/tutorial/script.ts` — pre-scripted tutorial beats: 5 steps teaching action input, dice, narration, character sheet, and image generation. Each beat has a canned narrator response (no AI call) and a scripted dice outcome.
- `src/lib/tutorial/tutorial-pipeline.ts` — lightweight pipeline that returns pre-scripted results instead of calling AI. Falls back to real pipeline only for the final "free play" moment.
- `src/app/demo/page.tsx` — tutorial session page (simplified version of `session/[id]/page.tsx`)
- `src/app/api/demo/route.ts` — creates tutorial session, no auth required

### 16.2 Tutorial Flow
1. Landing page shows "Try a Free Adventure" button
2. Click creates a tutorial session with pre-built character
3. 5 guided steps (~3 minutes):
   - Step 1: "Type what your character does" (teaches action input)
   - Step 2: "The dice decide your fate" (teaches dice system)
   - Step 3: "The world responds" (shows narration)
   - Step 4: "Check your character" (opens character sheet)
   - Step 5: "The world takes shape" (shows scene image)
4. After tutorial: "Create an account to play with friends" CTA
5. If they sign up, the tutorial character/session is discarded

### 16.3 Landing Page Integration
Add tutorial CTA to the home page for unauthenticated/new users.

**Files to modify:**
- `src/app/page.tsx` — add "Try a Free Adventure" button before the create/join session flow. Show it prominently for users who haven't completed the tutorial.

**Acceptance criteria:**
- [ ] New user can start tutorial without signing in
- [ ] Tutorial completes in under 3 minutes
- [ ] Zero AI API calls during tutorial (all pre-scripted)
- [ ] Tutorial teaches all core mechanics
- [ ] Clear CTA to sign up after tutorial
- [ ] Tutorial session doesn't count toward any limits

**Dependencies:** Phase 15 (auth) should be done first so the sign-up CTA works

---

## Phase 17: Monetization System

**Goal**: Implement credit-based monetization with Stripe integration. AI is expensive — players need to pay for sustained play.

### 17.1 Credit System Design
Each AI action costs credits based on the model tier used:
- Light model call (intent, rules, visual delta): 1 credit
- Heavy model call (narration): 3 credits
- Image generation: 5 credits
- Total per turn (typical): ~10 credits

### 17.2 Subscription Tiers
| Tier | Price | Monthly Credits | Image Gen | Priority |
|------|-------|----------------|-----------|----------|
| Free | $0 | 50/day (resets daily) | Low-res | Standard |
| Adventurer | $4.99/mo | 2,000/mo | Standard | Standard |
| Hero | $9.99/mo | 5,000/mo | HD | Priority queue |
| Legendary | $19.99/mo | Unlimited | HD | Priority + early access |

One-time credit packs: 500 credits ($2.99), 1500 credits ($7.99), 5000 credits ($19.99)

### 17.3 Database Schema

**New tables in `src/lib/db/schema.ts`:**

```typescript
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: text("user_id").notNull().references(() => authUsers.id),
  tier: text("tier").notNull(), // "free", "adventurer", "hero", "legendary"
  stripe_customer_id: text("stripe_customer_id"),
  stripe_subscription_id: text("stripe_subscription_id"),
  status: text("status").notNull().default("active"), // "active", "cancelled", "past_due"
  current_period_start: timestamp("current_period_start", { withTimezone: true }),
  current_period_end: timestamp("current_period_end", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditBalances = pgTable("credit_balances", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: text("user_id").notNull().references(() => authUsers.id).unique(),
  balance: integer("balance").notNull().default(0),
  daily_free_remaining: integer("daily_free_remaining").notNull().default(50),
  daily_free_reset_at: timestamp("daily_free_reset_at", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: text("user_id").notNull().references(() => authUsers.id),
  amount: integer("amount").notNull(), // positive = add, negative = deduct
  reason: text("reason").notNull(), // "subscription_grant", "purchase", "ai_usage", "image_gen"
  session_id: uuid("session_id"),
  turn_id: uuid("turn_id"),
  stripe_payment_id: text("stripe_payment_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### 17.4 Credit Deduction Hook
Integrate credit checks into the AI orchestration pipeline.

**Files to create:**
- `src/server/services/credit-service.ts` — `checkCredits(userId, cost)`, `deductCredits(userId, cost, reason, sessionId?, turnId?)`, `getBalance(userId)`, `grantMonthlyCredits(userId, tier)`
- `src/lib/schemas/enums.ts` — add `SubscriptionTierSchema`, `CreditReasonSchema`

**Files to modify:**
- `src/lib/orchestrator/step-runner.ts` — add credit deduction after successful AI call (or in pipeline.ts before each step)
- `src/lib/orchestrator/pipeline.ts` — check credit balance before starting pipeline. If insufficient, return error without calling AI.
- `src/app/api/sessions/[id]/actions/route.ts` — catch credit errors, return 402 Payment Required

### 17.5 Stripe Integration

**New dependencies:** `stripe` npm package

**Files to create:**
- `src/lib/stripe/client.ts` — Stripe SDK initialization
- `src/lib/stripe/config.ts` — price IDs, product IDs, tier mappings
- `src/app/api/stripe/checkout/route.ts` — create Stripe Checkout session
- `src/app/api/stripe/webhook/route.ts` — handle Stripe webhooks (subscription created/updated/cancelled, payment succeeded)
- `src/app/api/stripe/portal/route.ts` — create Stripe customer portal session
- `src/app/pricing/page.tsx` — pricing page with tier cards and buy buttons
- `src/components/credits/credit-balance.tsx` — credit balance display for header/nav
- `src/components/credits/low-credit-warning.tsx` — warning when credits are low
- `src/components/credits/paywall-modal.tsx` — shown when credits run out mid-session

**Env vars to add:**
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ADVENTURER`, `STRIPE_PRICE_HERO`, `STRIPE_PRICE_LEGENDARY`
- `STRIPE_PRICE_CREDITS_500`, `STRIPE_PRICE_CREDITS_1500`, `STRIPE_PRICE_CREDITS_5000`

### 17.6 UI Integration
- Credit balance in game session header (top-right)
- Low credit warning toast when below 20 credits
- Paywall modal when credits hit 0 during a session
- Pricing page accessible from home screen and profile

**Acceptance criteria:**
- [ ] Free users get 50 daily credits, enough for ~5 turns
- [ ] Credit deduction happens per AI call with correct cost
- [ ] Stripe Checkout works for subscriptions and one-time packs
- [ ] Webhook handles subscription lifecycle events
- [ ] Paywall appears when credits run out
- [ ] Subscribers receive monthly credit grants
- [ ] Credit balance visible during gameplay
- [ ] `npm run build` passes

**Dependencies:** Phase 15 (auth — need real user accounts for billing)

---

## Phase 18: Landing Page & Marketing Site

**Goal**: Create a compelling public-facing landing page that converts visitors to players.

### 18.1 Landing Page Design
For unauthenticated users, replace the current create/join session home with a marketing page.

**Files to create:**
- `src/app/(marketing)/page.tsx` — public landing page (route group for marketing pages)
- `src/app/(marketing)/layout.tsx` — marketing layout (different from game layout)
- `src/components/marketing/hero-section.tsx` — animated hero with scene image, tagline, CTA
- `src/components/marketing/feature-grid.tsx` — feature showcase cards
- `src/components/marketing/pricing-section.tsx` — pricing tiers comparison
- `src/components/marketing/testimonial-section.tsx` — social proof (placeholder initially)
- `src/components/marketing/footer.tsx` — links, socials, legal

**Files to modify:**
- `src/app/page.tsx` — check auth status: if authenticated, show game dashboard; if not, redirect to marketing page or show inline

### 18.2 SEO & Meta
- OpenGraph tags for social sharing (show scene image, tagline)
- Structured data (VideoGame schema)
- Sitemap generation
- Optimized meta descriptions

### 18.3 Game Dashboard (for authenticated users)
Replace the basic create/join with a proper dashboard showing:
- Active sessions (rejoin)
- Session history
- Character gallery
- Quick create/join actions
- Credit balance

**Files to create:**
- `src/app/dashboard/page.tsx` — authenticated user home
- `src/app/api/dashboard/route.ts` — GET user's sessions, characters, stats

**Acceptance criteria:**
- [ ] Unauthenticated users see marketing landing page
- [ ] Landing page has hero, features, pricing, CTA
- [ ] Authenticated users see game dashboard
- [ ] SEO meta tags present
- [ ] Mobile-responsive
- [ ] CTA buttons lead to sign-up or tutorial

**Dependencies:** Phase 15 (auth), Phase 17 (pricing info)

---

## Phase 19: Session History & Replay

**Goal**: Let players revisit past adventures and share epic moments.

### 19.1 Campaign Journal
Browse past sessions with their narrative logs and scene images.

**Files to create:**
- `src/app/history/page.tsx` — list of past sessions
- `src/app/history/[sessionId]/page.tsx` — full narrative replay (scrollable feed of all narrative events + images)
- `src/app/api/history/route.ts` — GET user's ended sessions
- `src/app/api/history/[sessionId]/route.ts` — GET narrative events + scene images for a session

### 19.2 Shareable Adventure Recaps
Public URLs for sharing adventures on social media.

**DB changes:**
- Add `share_token` text column to `sessions` (nullable, unique) — generated when user shares
- Add `is_public` boolean column to `sessions` (default false)

**Files to create:**
- `src/app/share/[token]/page.tsx` — public read-only adventure recap
- `src/app/api/sessions/[id]/share/route.ts` — POST to generate share token, GET to fetch shared session

### 19.3 Continue Campaign
Allow resuming ended sessions (start a new "chapter" that inherits state).

**Files to create:**
- `src/app/api/sessions/[id]/continue/route.ts` — creates new session linked to parent, copies character state and memory

### 19.4 Achievement System (stretch)
Track notable events: first critical success, first party wipe, 10 sessions played, etc.

**DB changes:**
- New `achievements` table: id, user_id, achievement_key, unlocked_at
- New `user_stats` table: id, user_id, total_sessions, total_turns, critical_successes, critical_failures, etc.

**Acceptance criteria:**
- [ ] Users can browse their past sessions
- [ ] Full narrative replay with images works
- [ ] Share links generate public recap pages
- [ ] Continue campaign creates linked session
- [ ] Achievements track at least 5 milestones

**Dependencies:** Phase 15 (auth)

---

## Phase 20: Social & Online Features

**Goal**: Make Ashveil social — friends, invites, public games, notifications.

### 20.1 Friends System

**DB changes:**
- New `friendships` table: id, user_id_a, user_id_b, status (pending/accepted/blocked), created_at

**Files to create:**
- `src/server/services/friends-service.ts`
- `src/app/api/friends/route.ts` — GET friends list, POST send request
- `src/app/api/friends/[id]/route.ts` — PATCH accept/reject, DELETE unfriend
- `src/components/social/friends-list.tsx`
- `src/components/social/friend-request.tsx`

### 20.2 Invite System
Multiple invite methods for maximum conversion.

**Files to create:**
- `src/lib/invite/link-generator.ts` — generate deep links with session code
- `src/lib/invite/qr-generator.ts` — QR code for session join (use canvas or library)
- `src/components/social/invite-modal.tsx` — modal with copy link, QR, share buttons

### 20.3 Public Session Browser
Let solo players find open games to join.

**DB changes:**
- Add `is_public` boolean column to `sessions` (default false)
- Add `description` text column to `sessions`

**Files to create:**
- `src/app/browse/page.tsx` — browse public sessions
- `src/app/api/sessions/public/route.ts` — GET open public sessions (status: lobby, is_public: true)

### 20.4 Push Notifications (PWA)
Turn reminders and session invites via web push.

**Files to create:**
- `src/lib/notifications/push-service.ts` — web push subscription management
- `src/app/api/push/subscribe/route.ts` — save push subscription
- `src/app/api/push/send/route.ts` — send notification (internal use)
- Add push notification triggers in turn-service.ts when it's a player's turn

### 20.5 Discord Bot (stretch)
Bot that posts session summaries and turn notifications to Discord channels.

**Acceptance criteria:**
- [ ] Users can send/accept/reject friend requests
- [ ] Invite via link and QR code works
- [ ] Public session browser shows open lobbies
- [ ] Push notifications fire on turn change
- [ ] Friends can see each other's online status

**Dependencies:** Phase 15 (auth), Phase 19 (for session browsing)

---

## Phase 21: Enhanced Gameplay Features

**Goal**: Deepen the RPG mechanics to increase session length and replayability.

### 21.1 Inventory System
Items that players can use during actions.

**Implementation:**
- Extend `characters.inventory` JSON schema to have structured items: `{ id, name, type, description, uses_remaining, stats_bonus }`
- Add `use_item` handling in intent parser and rules interpreter
- Narrator references items used in narration
- UI: inventory tab in character sheet, drag-to-use on action bar

### 21.2 Spell System
Spell casting with mana costs and cooldowns.

**Implementation:**
- Extend `characters.abilities` JSON schema: `{ id, name, type: "spell"|"ability", mana_cost, cooldown_rounds, description }`
- Track cooldowns per session in a new `ability_cooldowns` jsonb column on `characters`
- Rules interpreter checks mana and cooldowns before allowing spell use
- Consequence interpreter deducts mana

### 21.3 NPC Dialogue
AI-generated branching conversations with NPCs.

**Files to create:**
- `src/lib/orchestrator/workers/dialogue-generator.ts` — new worker for NPC dialogue
- `src/lib/schemas/ai-io.ts` — add `DialogueOutputSchema`
- `src/components/game/dialogue-card.tsx` — NPC dialogue UI with response options

### 21.4 Boss Encounters
Multi-phase boss fights with escalating mechanics.

**Implementation:**
- Extend `npc_states` with `is_boss` boolean, `phase` integer, `phase_triggers` jsonb
- Rules interpreter handles phase transitions on HP thresholds
- Narrator generates dramatic phase-change narration

### 21.5 Rest Mechanics
Party rest between encounters: heal, shop, prepare.

**Implementation:**
- Add `"rest"` phase handling in turn-logic.ts
- Rest heals HP/mana based on roll
- Optional: merchant NPC for item purchases during rest

### 21.6 Character Leveling
XP and level progression.

**DB changes:**
- Add `xp` integer column to `characters` (default 0)

**Implementation:**
- Award XP in consequence interpreter based on action outcomes
- Level-up triggers stat boosts, new abilities
- UI: level-up animation and notification

**Acceptance criteria:**
- [ ] Players can use inventory items in actions
- [ ] Spells cost mana and have cooldowns
- [ ] NPC dialogue generates response options
- [ ] Boss fights have phase transitions
- [ ] Rest mechanics heal the party
- [ ] Characters gain XP and level up

**Dependencies:** Core gameplay (done), Phase 17 (credits for AI costs)

---

## Phase 22: Performance & Scale

**Goal**: Optimize for 100+ concurrent sessions and sub-3-second turn resolution.

### 22.1 AI Response Streaming
Stream narration text as it generates instead of waiting for full response.

**Implementation:**
- Add `generateStream()` method to `AIProvider` interface
- Narrator uses streaming to send partial text via Pusher
- Frontend typewriter effect already exists — wire it to streaming events
- New Pusher event: `narration-stream` with partial text chunks

### 22.2 Connection Recovery
Handle Pusher disconnects gracefully.

**Implementation:**
- Client-side: detect disconnect, show reconnecting indicator, re-fetch state on reconnect
- `src/lib/socket/use-session-channel.ts` already has connection status — enhance with auto-recovery
- Add `GET /api/sessions/[id]/state` call on reconnect to sync missed events

### 22.3 Image CDN
Move generated images to a CDN instead of serving from origin.

**Implementation:**
- Upload fal.ai results to Vercel Blob or Cloudflare R2
- Serve via CDN URL instead of API route
- Cache headers for generated images

### 22.4 Database Optimization
- Add database connection pooling via Neon's pooler endpoint
- Add read replicas for GET endpoints
- Index optimization based on query patterns from orchestration_traces

### 22.5 Rate Limiting
Per-user rate limiting (not just per-session).

**Files to modify:**
- `src/lib/ai/rate-limiter.ts` — add user-level rate limits alongside session limits
- Rate limit based on subscription tier (Legendary gets higher limits)

### 22.6 Load Testing
Target: 100 concurrent sessions, 600 concurrent players.

**Files to create:**
- `tests/load/k6-session.ts` — k6 load test script simulating full session lifecycle

**Acceptance criteria:**
- [ ] Narration streams to clients in real-time
- [ ] Disconnected players auto-recover state
- [ ] Images served from CDN
- [ ] 100 concurrent sessions sustained for 30 minutes
- [ ] P95 turn resolution under 3 seconds

**Dependencies:** Phases 15-17 (need real usage patterns to optimize)

---

## Phase 23: Analytics & Admin

**Goal**: Understand usage, costs, and quality to make data-driven decisions.

### 23.1 Admin Dashboard

**Files to create:**
- `src/app/admin/page.tsx` — admin dashboard (protected by admin role check)
- `src/app/admin/layout.tsx` — admin layout
- `src/app/api/admin/stats/route.ts` — aggregated stats
- `src/app/api/admin/sessions/route.ts` — session list with filters
- `src/app/api/admin/users/route.ts` — user list

**DB changes:**
- Add `is_admin` boolean to `users` table (default false)

### 23.2 Cost Tracking
Already have `orchestration_traces` with token counts and model info.

**Implementation:**
- Dashboard page that aggregates: total tokens, cost per session, cost per user, daily spend
- Alert when daily AI spend exceeds threshold
- Per-model breakdown (which providers are cheapest/most reliable)

### 23.3 Quality Monitoring
- Fallback rate per worker (high fallback = model quality issue)
- Latency percentiles: p50, p95, p99 per pipeline step
- Error rate tracking

### 23.4 User Analytics
- DAU/WAU/MAU
- Session duration distribution
- Retention (D1, D7, D30)
- Conversion: tutorial -> sign-up -> paid
- Revenue metrics: MRR, ARPU, churn rate

### 23.5 Error Tracking
Integrate Sentry or similar for error monitoring.

**New dependency:** `@sentry/nextjs`

**Files to create:**
- `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- `src/instrumentation.ts` (Next.js instrumentation hook)

### 23.6 Feature Flags
Simple feature flag system for gradual rollouts.

**DB changes:**
- New `feature_flags` table: id, key, enabled, rollout_percentage, created_at

**Files to create:**
- `src/lib/feature-flags.ts` — `isFeatureEnabled(key, userId?)` function
- `src/app/api/admin/flags/route.ts` — CRUD feature flags

**Acceptance criteria:**
- [ ] Admin dashboard shows active sessions, user count, AI cost
- [ ] Cost per session visible
- [ ] Fallback rate and latency metrics displayed
- [ ] Basic user analytics (DAU, retention)
- [ ] Error tracking integrated
- [ ] Feature flags work for gradual rollouts

**Dependencies:** Phase 15 (auth), Phase 17 (billing data)

---

## Phase 24: Polish & Launch

**Goal**: Final polish, compliance, and launch preparation.

### 24.1 Mobile App Wrapper
Wrap the PWA in a native shell for App Store / Google Play.

**Options:**
- Capacitor (recommended — works with existing Next.js PWA)
- TWA (Trusted Web Activity) for Android
- Submit to both stores

### 24.2 Accessibility Audit
- Full ARIA labeling on all interactive elements
- Keyboard navigation for all flows
- Screen reader testing
- Color contrast verification (Liquid Obsidian dark theme needs careful contrast)
- Focus management in modals and bottom sheets

### 24.3 Internationalization (i18n)
- Extract all UI strings to translation files
- `src/lib/copy/ashveil.ts` already centralizes copy — extend to multi-language
- Priority languages: English, Spanish, Portuguese, French, German, Japanese
- AI narration stays in the session's language (pass language to narrator system prompt)

### 24.4 Legal & Compliance
**Files to create:**
- `src/app/(marketing)/terms/page.tsx` — Terms of Service
- `src/app/(marketing)/privacy/page.tsx` — Privacy Policy
- `src/app/(marketing)/cookies/page.tsx` — Cookie Policy
- Cookie consent banner component

**Key considerations:**
- GDPR compliance (data export, deletion)
- COPPA compliance (age gate if needed)
- Stripe PCI compliance (handled by Stripe Checkout)
- AI-generated content disclaimers

### 24.5 Content Moderation
Prevent harmful user-generated content in adventure prompts and player actions.

**Implementation:**
- Pre-filter adventure prompts through a moderation API (OpenAI moderation endpoint is free)
- Filter player actions before sending to AI pipeline
- Report mechanism for offensive AI-generated content

**Files to create:**
- `src/lib/moderation/filter.ts` — content moderation check
- Hook into `src/app/api/sessions/route.ts` (adventure prompt) and `src/app/api/sessions/[id]/actions/route.ts` (player actions)

### 24.6 Beta Testing Program
- Private beta with invite codes
- Feedback collection (in-app form or Discord integration)
- Bug reporting flow

### 24.7 Launch Marketing
- Product Hunt launch
- Reddit communities: r/DnD, r/RPG, r/gamedev, r/IndieGaming
- Twitter/X campaign with gameplay GIFs
- Discord server for community
- Influencer outreach to D&D content creators
- Blog post: "How we built an AI Dungeon Master"

**Acceptance criteria:**
- [ ] PWA installable on mobile
- [ ] All interactive elements have ARIA labels
- [ ] Terms of Service and Privacy Policy pages exist
- [ ] Content moderation filters harmful prompts
- [ ] Beta invite system works
- [ ] Landing page optimized for launch marketing

**Dependencies:** All previous phases

---

## Priority Matrix

| Phase | Priority | Revenue Impact | Effort | Do First? |
|-------|----------|---------------|--------|-----------|
| 15: Auth | CRITICAL | Enables billing | Medium | YES |
| 16: Onboarding | HIGH | Conversion | Medium | YES |
| 17: Monetization | CRITICAL | Direct revenue | High | YES |
| 18: Landing Page | HIGH | Conversion | Medium | After 15-17 |
| 19: History/Replay | MEDIUM | Retention | Medium | After 18 |
| 20: Social | MEDIUM | Growth/viral | High | After 18 |
| 21: Gameplay | MEDIUM | Retention | High | Parallel with 19-20 |
| 22: Performance | HIGH | Required for scale | Medium | Before launch |
| 23: Analytics | HIGH | Decision-making | Medium | Before launch |
| 24: Polish/Launch | CRITICAL | Go to market | High | Final phase |

---

## Quick Reference: New Dependencies Needed

| Phase | Package | Purpose |
|-------|---------|---------|
| 17 | `stripe` | Payment processing |
| 23 | `@sentry/nextjs` | Error tracking |
| 24 | `@capacitor/core` | Mobile app wrapper (optional) |

---

## Quick Reference: New Env Vars Needed

| Phase | Variable | Purpose |
|-------|----------|---------|
| 15 | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth |
| 15 | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord OAuth |
| 17 | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Stripe billing |
| 17 | `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| 17 | `STRIPE_PRICE_*` (multiple) | Stripe price IDs for each tier/pack |
| 23 | `SENTRY_DSN` | Error tracking |
| 23 | `NEXT_PUBLIC_SENTRY_DSN` | Client-side error tracking |
