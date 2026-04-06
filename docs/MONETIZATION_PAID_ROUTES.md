# Paid-capable routes — wiring status

Server paths that debit **Sparks** when `MONETIZATION_SPEND_ENABLED=true`. Payer is **`sessions.host_user_id`** for session-scoped AI/images except portraits/class (current user).

| Area | Path | Status |
| ---- | ---- | ------ |
| Campaign actions | `src/app/api/sessions/[id]/actions/route.ts` | Wired (`ai_dm` only, 1 Spark / turn); `chapter_turn_cap` 409 when chapter max turns exceeded |
| Session start | `src/app/api/sessions/[id]/start/route.ts` | Wired (`ai_dm` campaign, session start bundle) |
| Session image | `src/app/api/sessions/[id]/image/route.ts` | Wired; chapter image budget (`chapter_image_budget` 409); non-internal cooldown (`scene_image_cooldown` 429) |
| Chapter continue | `src/app/api/sessions/[id]/chapter/continue/route.ts` | Host-only; no Sparks (template recap) |
| Table pool contribute | `src/app/api/sessions/[id]/spark-pool/contribute/route.ts` | Member debits self → `sessions.spark_pool_balance`; AI spend uses pool first via `tryDebitSparksWithSessionPool` |
| Party scene image | `src/app/api/sessions/[id]/party/scene-image/route.ts` | Wired (sync debit before `after()` job) |
| Party vote judge | `src/server/services/party-phase-service.ts` → `runPartyJudgePickWinner` | Wired |
| Party round opener | `src/server/services/party-phase-service.ts` → `hydratePartyRoundSceneBeat` | Wired |
| Final chapter | `src/app/api/sessions/[id]/final-chapter/route.ts` | No AI — N/A |
| DM routes | `src/app/api/sessions/[id]/dm/*` | No `getAIProvider` — N/A |
| Generate class | `src/app/api/characters/generate-class/route.ts` | Wired (payer = user) |
| Character portrait | `src/app/api/characters/portrait/route.ts` | Wired (free tier + Sparks) |
| Profile hero portrait | `src/app/api/profile/heroes/[id]/portrait/route.ts` | Wired |
| Tutorial start | `src/app/api/tutorial/start/route.ts` | No direct AI call — N/A |
| Extra profile hero slot | `src/app/api/profile/heroes/route.ts` POST | Wired (10 Sparks → `purchased_hero_slots`) |
| Copy public hero | `src/app/api/profile/heroes/copy/route.ts` | Wired (same slot purchase flow) |

**Wallet read:** `GET /api/wallet` → `{ balance }`.

**Credits (fiat → Sparks):**

- **Primary:** `GET|POST /api/checkout/sparks` (auth’d) — server picks **Stripe** (Checkout Session redirect) or **Razorpay** (order + embedded checkout) from geo headers; catalog `SPARK_PACKS_JSON` in [`.env.example`](../.env.example).
- **Webhooks:** `POST /api/webhooks/stripe` (`STRIPE_WEBHOOK_SECRET`), `POST /api/webhooks/razorpay` (`RAZORPAY_WEBHOOK_SECRET`).
- **Confirm fallback:** `POST /api/checkout/sparks/confirm` when webhooks are delayed (e.g. localhost). UI should use neutral copy only (e.g. “Pay securely”), not PSP names.
- **Legacy:** `POST /api/webhooks/dodo` + `DODO_*` only if you still credit old Dodo payments.

**Constants:** [`src/lib/spark-pricing.ts`](../src/lib/spark-pricing.ts).

**Economy:** [`src/server/services/spark-economy-service.ts`](../src/server/services/spark-economy-service.ts).

**Gaps / follow-ups**

- Live HUD does not subscribe to Pusher for balance; it refetches after actions and on session load (Phase 4 nice-to-have).
- Party HTTP actions that only enqueue async AI may surface spend failures via state sync rather than the submit response; treat as known UX edge.
