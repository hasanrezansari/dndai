# Falvos — Monetization, Wallet & Payments System (v1)

**Status:** Planning / implementation guide  
**Audience:** Product + Design + Engineering (wallet, UX, payments, analytics).  

---

## Table of contents

1. [Product overview](#1-product-overview)  
2. [Core constraints and philosophy](#2-core-constraints-and-philosophy)  
3. [Core product loop](#3-core-product-loop)  
4. [Currency model (Sparks wallet)](#4-currency-model-sparks-wallet)  
5. [Pricing and pack design](#5-pricing-and-pack-design)  
6. [Onboarding + first wallet grant](#6-onboarding--first-wallet-grant)  
7. [Gameplay UX (invisible monetization)](#7-gameplay-ux-invisible-monetization)  
8. [Low Sparks + out-of-Sparks states](#8-low-sparks--out-of-sparks-states)  
9. [Paywall (Continue Your Story)](#9-paywall-continue-your-story)  
10. [Daily Sparks system (retention loop)](#10-daily-sparks-system-retention-loop)  
11. [Session persistence](#11-session-persistence)  
12. [Multiplayer (host pays)](#12-multiplayer-host-pays)  
13. [Cost control and sustainability](#13-cost-control-and-sustainability)  
14. [Payments strategy + provider phases](#14-payments-strategy--provider-phases)  
15. [Payment routing logic](#15-payment-routing-logic)  
16. [Payment UX flow](#16-payment-ux-flow)  
17. [Data model + system requirements](#17-data-model--system-requirements)  
18. [Risks and mitigations](#18-risks-and-mitigations)  
19. [Guiding principles (non-negotiables)](#19-guiding-principles-non-negotiables)  
20. [Appendix A — Pre-monetization prerequisites checklist](#appendix-a--pre-monetization-prerequisites-checklist)

---

## 1. Product overview

Falvos is a **multiplayer, AI-driven storytelling game** where players create unpredictable adventures together in real time.

Core characteristics:

- Turn-based storytelling
- AI-generated outcomes + images
- Multiplayer, session-like gameplay
- Real-time decisions

---

## 2. Core constraints and philosophy

### 2.1 Core constraint

- Each turn and image incurs API cost.
- Gameplay must remain uninterrupted and immersive.

### 2.2 Core philosophy

> Never interrupt the story.  
> Only monetize when the player wants to continue it.

---

## 3. Core product loop

1. User opens app
2. Claims daily Sparks
3. Sees ongoing story (resume point)
4. Plays
5. Sparks reduce silently
6. Runs out → decision point:
   - Pay → continue now
   - Wait → return tomorrow (claim again)

---

## 4. Currency model (Sparks wallet)

### 4.1 Definition

> **Sparks** = energy that fuels the story.

### 4.2 Wallet model

- Users hold a **Sparks balance**.
- Sparks are deducted automatically per action (no per-turn payments).
- Users purchase Sparks in packs, then spend seamlessly during gameplay.

### 4.3 Cost mapping

| Action | Cost |
|---|---:|
| Text turn | 1 Spark |
| Image generation | 5 Sparks |

### 4.4 Average session usage (planning assumption)

- 20 turns + 6 images → ~50 Sparks

---

## 5. Pricing and pack design

### 5.1 Packs (India, launch)

| Price | Sparks | Sessions (approx) |
|---:|---:|---:|
| ₹99 | 120 | ~2–3 |
| ₹299 | 400 | ~7–8 |
| ₹499 | 800 | ~15 |

### 5.2 Economics targets

- Cost/session ≈ ₹10–₹13 (driven primarily by images)
- Revenue/session ≈ ₹30–₹40
- Target margin: **2.5x–3x**

### 5.3 Why Sparks (not “credits”)

- Removes tool-like feel
- Enhances immersion
- Builds brand identity and a reusable UX metaphor

---

## 6. Onboarding + first wallet grant

### 6.1 Entry

- Minimal landing screen → **Start**

### 6.2 Intro

> “Use Sparks to make choices and continue your story.”

### 6.3 Reward

- On first successful sign-in, grant **+50 Sparks** (onboarding grant).

### 6.4 Immediate gameplay

- No tutorial.
- Learn via usage; the wallet metaphor explains itself through feedback.

---

## 7. Gameplay UX (invisible monetization)

### 7.1 Top bar wallet

- Display wallet persistently as:
  - `⚡ 42 Sparks`

### 7.2 Behavior

- Sparks are deducted silently; gameplay continues without interruption.

### 7.3 Micro-feedback

- After each spend, show minimal feedback near wallet:
  - `-1 Spark`
  - `-5 Sparks`

---

## 8. Low Sparks + out-of-Sparks states

### 8.1 Low Sparks state

Trigger when balance < 10 Sparks:

> “You’re running low on Sparks”

Guideline:

- Low Sparks is a **gentle nudge**, not a blocker.
- Avoid modals during active gameplay; prefer a light banner/toast.

### 8.2 Out of Sparks (critical moment)

Trigger when balance = 0:

Title:

> You’re out of Sparks

Subtext:

> Don’t lose this moment

Actions:

- **Get Sparks** (primary)
- **Come back tomorrow** (secondary)

Key rule:

- This is the **only** moment where gameplay pauses for monetization.

---

## 9. Paywall (Continue Your Story)

### 9.1 Trigger

- Sparks exhausted (balance = 0)
- Ideally aligned with an emotional peak / cliffhanger beat

### 9.2 Layout

Title:

> Continue Your Story

Packs:

- ₹99 → 120 Sparks
- ₹299 → 400 Sparks (**Most Popular**)
- ₹499 → 800 Sparks

CTA:

> Get Sparks

Secondary:

> Or claim free Sparks tomorrow

### 9.3 Paywall principles

- One screen, fast decision.
- No upsell labyrinth.
- Preserve immersion: framing is “continue the story,” not “buy credits.”

---

## 10. Daily Sparks system (retention loop)

### 10.1 Mechanism

- +10 Sparks/day
- **Manual claim** required

### 10.2 Why manual claim

- Drives daily usage
- Builds habit loop

### 10.3 Constraints (anti-abuse)

- Daily claim is capped by design intent (example policy):
  - No “infinite free play”
  - Consider a max free-wallet cap (e.g., cannot accumulate above a threshold from daily claims alone)

### 10.4 Future (not required for v1)

- Streak-based rewards (graduated daily amounts)

---

## 11. Session persistence

- Story state auto-saved.
- Users can leave and resume anytime.
- Resume should land exactly at the latest beat (no re-onboarding).

---

## 12. Multiplayer (host pays)

### 12.1 Host pays model

- One player (host) spends Sparks for shared actions.
- Others join free.

### 12.2 Benefits

- Reduces friction for new users
- Supports virality and easier party formation
- Concentrates monetization where intent is highest (the host)

---

## 13. Cost control and sustainability

### 13.1 Cost drivers

- Text generation (Gemini Flash): small per turn (planning assumption: near-negligible)
- Image generation (Gemini Flash Image): primary cost driver

### 13.2 Control levers

- Limit images per session / per time window
- Optimize prompts
- Cap generation frequency
- Prefer asynchronous image generation (never block core turn resolution)

Guideline:

> Gameplay should always be able to proceed with text; images are optional enhancement.

---

## 14. Payments strategy + provider phases

### 14.1 Core payment principle

> Payments must be invisible, fast, and local to the user.

### 14.2 Phase 1 (launch)

- **India**: Razorpay (UPI-first, cards supported)
- **Global**: Razorpay (cards fallback)

### 14.3 Phase 2 (scale)

- **India**: Razorpay
- **Global**: Lemon Squeezy (Merchant of Record)

### 14.4 Phase 3 (advanced)

- **India**: Razorpay
- **Global**: Stripe (Apple Pay, Google Pay)

Rationale:

- India needs UPI
- Global needs Apple Pay / cards at high conversion
- No single provider solves both perfectly

---

## 15. Payment routing logic

When user clicks **Get Sparks**:

- If user is **India**:
  - Show Razorpay flow (UPI-first)
- If user is **Global**:
  - Show Lemon Squeezy / Stripe (based on enabled phase)

Region input sources (implementation choice):

- App-selected region on onboarding, OR
- Geo-IP + billing country, OR
- Inferred from payment method availability

---

## 16. Payment UX flow

1. User clicks **Get Sparks**
2. Select pack
3. Payment modal opens (provider-native)
4. Payment success
5. Sparks instantly credited
6. User returned to gameplay

### 16.1 Post-payment feedback

> ⚡ +120 Sparks  
> Continue your story

Key rule:

- On success, return user to the **exact story moment** they were trying to continue.

---

## 17. Data model + system requirements

### 17.1 Auth

- Google login

### 17.2 User model (minimum)

- `user_id`
- `sparks_balance`
- `last_claimed`
- `region`

### 17.3 Session model (minimum)

- `session_id`
- `story_state`
- `players`

### 17.4 Wallet system requirements

- Real-time deduction
- Instant UI updates
- (Optional but recommended) transaction logging for reconciliation/support

---

## 18. Risks and mitigations

- **High cost burn**: limit images; throttle frequency; optimize prompts
- **Payment friction**: local methods (UPI in India) + global optimized methods (MoR / Apple Pay)
- **User drop-off**: daily Sparks + session persistence
- **Global conversion loss**: add global provider early (Phase 2)

---

## 19. Guiding principles (non-negotiables)

1. **Never interrupt the story** during normal play.
2. **Only block at zero Sparks**, and only to offer “continue now” vs “come back tomorrow.”
3. Wallet is a **game mechanic**, not a billing UI.
4. Images must be treated as a **cost-controlled premium enhancement**, never a gameplay hard dependency.

---

## Appendix A — Pre-monetization prerequisites checklist

These are the **must-have product features** to ship (or explicitly defer with known trade-offs) **before** enabling monetization at scale. If any of these are missing, monetization will feel unfair, confusing, or “leaky.”

### A.1 Identity, profiles, and player continuity

- **Google login (or equivalent)**: reliable auth, token refresh, logout, account switching.
- **Guest-to-account upgrade**: allow a tutorial run as guest, then convert to Google login without losing progress.
- **Player profile**:
  - display name + avatar
  - lightweight “vibe”/bio (optional)
  - preferences (sound, haptics, accessibility, content toggles)
- **Per-user history**: list of sessions the user is part of (active + past), with last played timestamp.
- **Cross-device continuity**: session list and wallet reflect the same canonical state.

### A.2 Tutorial / first-run experience (make the loop legible)

- **Tutorial run**:
  - short, guided 3–5 turn mini-session that demonstrates choices, dice, and a first image
  - ends with a clear “Resume / Start real adventure” handoff
- **Wallet intro**:
  - shows Sparks as story fuel (in-world framing)
  - confirms initial grant (e.g. +50 Sparks) with a single lightweight toast
- **Tutorial skip**: allowed, but always available later from settings/help.

### A.3 Session persistence and “resume perfectly”

- **Auto-save** every turn (story state + latest narrative + pending jobs).
- **Resume exactly where you left**:
  - last beat highlighted
  - clear “what just happened” recap (1–2 lines) on return
- **Rejoin handling**:
  - if a player disconnects mid-turn, they can rejoin without breaking turn order
  - presence indicators update cleanly
- **Session roster state**: track who’s currently connected and who is “away.”

### A.4 Multiplayer fairness + roles

- **Host + player roles**: clear host indicators and permissions (start session, invite code, etc.).
- **Join flow**: join-by-code is stable; handles full sessions gracefully.
- **Turn fairness**:
  - players know whose turn it is and what they can do (no ambiguity).
- **Spectator mode** (optional): allow joining without impacting turn order (reduces friction for new players).

### A.5 Visual experience rules (so images never feel unfair)

If you adopt “player-centric vignette each turn + occasional full scene refresh,” you need explicit, deterministic rules:

- **Per-turn vignette guarantee**: each player receives a visual for their turn (vignette/spotlight), so nobody feels skipped.
- **Scene refresh triggers** (wide establishing shots):
  - location shift, major reveal, big environmental change, boss/event beats, chapter boundary
  - (optional) critical success/failure moments
- **Asynchronous images**: gameplay never blocks on image generation; if delayed, show a “developing” placeholder and deliver later.
- **Upgrade path**:
  - offer “Upgrade to cinematic scene” on a vignette (paid or limited), but never required to progress.

### A.6 Wallet correctness (before charging money)

- **Ledger / audit trail** (strongly recommended):
  - every grant/spend recorded with timestamp + session_id + reason
  - enables refunds, dispute handling, and debugging.
- **Atomic deduction**:
  - prevent double-spends on retries / reconnections
  - idempotency keys for turn submission and wallet deduction
- **Client + server reconciliation**:
  - client displays optimistic balance, server is source of truth, auto-corrects on mismatch.
- **Daily claim correctness**:
  - enforce claim intervals and caps consistently across devices/timezones.

### A.7 Reliability, support, and trust

- **Graceful failure modes**:
  - if an AI step fails, the turn still resolves (fallback narration; no “dead turn”)
  - if image fails, show vignette placeholder; do not block.
- **User-visible status**:
  - network/realtime connection indicator
  - “saving…” / “synced” hints for confidence
- **Support entry point**:
  - in-app support link + basic diagnostics (session id, last error)
  - “restore purchases / reconcile wallet” action for payments phase

### A.8 Safety and community protections (minimum viable)

- **Content filters**:
  - basic input moderation to prevent obvious policy violations
  - image safety failure UX that is non-alarming but clear (“Couldn’t render that. Try another description.”)
- **Report flow** (lightweight): report session content / player behavior.
- **Rate limiting**:
  - prevent spam turns and automated abuse that burns tokens.

### A.9 Analytics and experimentation (so you don’t fly blind)

- **Funnel metrics**:
  - tutorial completion
  - session started → turns played → sessions resumed
  - low Sparks → paywall view → purchase conversion
- **Unit economics metrics** (must-have):
  - images per turn, images per session
  - cost per turn, cost per image (by model/provider)
  - cost per retained session / day-1 retained user
- **A/B framework** (optional early, important soon): paywall copy, pack ordering, thresholds.

### A.10 Payments readiness (before turning it on)

- **Region detection**: consistent `region` selection/inference for payment routing.
- **Provider integration basics**:
  - purchase verification (server-side)
  - idempotent crediting (never double-credit)
  - refund/chargeback handling policy
- **Compliance basics**:
  - receipts, terms, privacy policy, support email.


