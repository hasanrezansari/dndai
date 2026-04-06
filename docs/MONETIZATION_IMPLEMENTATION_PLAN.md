# Ashveil — Monetization implementation plan

Single source of truth for **phase-by-phase** engineering: **Sparks** (internal economy), **Dodo** (fiat → Sparks only), **no creator cash-out** in this scope. Assumes **greenfield**: no obligation to preserve legacy user balances or sessions; you may reset or clear data when introducing the wallet.

**Related:** Product rules and deeper analysis live in the Cursor plan (`monetization_analysis_plan_*.plan.md` under `.cursor/plans/`). This doc is the **execution checklist** for the repo.

---

## 1. Scope and principles

| In scope | Out of scope (later) |
| -------- | -------------------- |
| Internal **Sparks** ledger in Postgres | Creator **fiat** payout, cash-out, creator KYC |
| **Dodo**: checkout + **webhook → credit** Sparks | Dodo per-turn / deep billing coupling |
| Gating **before** every paid AI/image call | “Unlimited” subscriptions that bypass caps |
| **Host** as default payer for session AI | Per-player-per-turn billing (deferred) |

**Architecture (non-negotiable)**

- **Ledger 1 — Players:** `user_wallets` + `spark_transactions` (append-only semantics; balance derived or locked row).
- **Ledger 2 — Infra:** OpenRouter + image providers; **never** tied 1:1 to Spark display.
- **Dodo:** Money in only; gameplay never calls Dodo on each turn.

**Greenfield note:** New users start with **0** Sparks unless you grant a **signup bonus** via migration or application logic. No grandfathering or migration from a pre-wallet era.

---

## 2. Product rules (implementation must enforce)

### 2.1 Sparks and payments

- **1 Spark** = primary unit for UX; calibrate costs from measured text/image COGS (see §8).
- **Dodo:** shallow — products/payment links, server-verified webhook, idempotent credit.
- Sparks are **non-redeemable** virtual currency (wording for Terms of Service).

### 2.2 Session payer

- **`payer_user_id` = `sessions.host_user_id`** by default.
- Lobby copy: host funds the tale; guests may have **0** Sparks and still play if host has balance.

### 2.3 Human vs AI DM

- `sessions.mode`: `ai_dm` | `human_dm` ([`src/lib/schemas/enums.ts`](../src/lib/schemas/enums.ts)).
- **Charge Sparks only** when the server calls **AI or paid image** APIs for that action.
- **Human DM** paths that do not invoke AI: **0** Sparks.

### 2.4 Profile / heroes

- Extra hero slot: **10 Sparks** (align UI copy in profile).
- Portrait reroll: **5–10 Sparks** after free uses (`user_profile_settings.free_portrait_uses` in schema).

### 2.5 UGC / templates (later phases)

- Phases 1–2: **100%** of Spark spend on UGC worlds stays **platform**; creator **metrics** only.
- Phase 3+ (optional): internal **creator Sparks accrual** (spend in-app only) — **not** cash-out.

---

## 3. Cross-cutting engineering rules

1. **Feature flag:** `MONETIZATION_SPEND_ENABLED` — when `false`, skip debits (optional `MONETIZATION_DRY_RUN_LOG=true` to log would-be charges). Use to land schema before enforcement.
2. **Idempotency:** Every debit uses a stable **`idempotency_key`** (e.g. `sessionId` + `state_version` or dedicated action id). Never double-charge on retries.
3. **Reserve → AI call → commit / release** — If OpenRouter/image fails, **release** reserved Sparks.
4. **Server-only:** Never trust client balance; all mutations on authenticated API + DB transaction with row lock on wallet.
5. **`game_kind`:** `campaign` and `party` — both must be covered wherever AI/images run.

---

## 4. Paid-capable API inventory (Phase 0)

Audit and tick when each route is wired to the economy service.

| Area | Path | Notes |
| ---- | ---- | ----- |
| Campaign actions | `src/app/api/sessions/[id]/actions/route.ts` | Main AI loop |
| Session start | `src/app/api/sessions/[id]/start/route.ts` | Seeder + opening image |
| Session image | `src/app/api/sessions/[id]/image/route.ts` | If used |
| Party scene image | `src/app/api/sessions/[id]/party/scene-image/route.ts` | Party mode |
| Final chapter | `src/app/api/sessions/[id]/final-chapter/route.ts` | |
| DM routes | `src/app/api/sessions/[id]/dm/*` | Only if `getAIProvider` / images |
| Generate class | `src/app/api/characters/generate-class/route.ts` | |
| Portrait | `src/app/api/characters/portrait/route.ts` | |
| Profile hero portrait | `src/app/api/profile/heroes/[id]/portrait/route.ts` | |
| Tutorial | `src/app/api/tutorial/start/route.ts` | If hits AI |

**Phase 0 checklist**

- [ ] Table above copied or linked in a PR / ticket; each row assigned.
- [ ] `MONETIZATION_SPEND_ENABLED` and optional `MONETIZATION_DRY_RUN_LOG` documented in [`.env.example`](../.env.example).
- [ ] Confirm `human_dm` vs `ai_dm` code paths for `actions` and DM routes.

---

## 5. Implementation phases

### Phase 1 — Schema: wallet + ledger

**Deliverables**

- Drizzle: e.g. `user_wallets` (`user_id`, `balance` or balance via ledger sum), `spark_transactions` with:
  - `type`: `credit` | `debit` | `reserve` | `release` (or credit/debit only if you collapse reserve)
  - `amount`, `reason`, `idempotency_key` (unique per user where needed), `session_id` nullable, `external_payment_id` nullable, `metadata` jsonb optional
- Indexes: `user_id`, `created_at`, unique on `(user_id, idempotency_key)` for debits
- Migration run: `npm run db:generate` / `db:migrate` per project scripts

**Optional:** On **signup**, grant **starter Sparks** (single `credit` row) — product choice, not legacy migration.

**Phase 1 checklist**

- [ ] Tables + migration committed
- [ ] `getSparkBalance(userId)` helper (read path)
- [ ] No enforcement yet (or flag off)

---

### Phase 2 — Economy service + pilot route

**Deliverables**

- `src/server/services/spark-economy-service.ts` (name as you prefer): constants from §8, `reserve` / `commit` / `release` in **one transaction** with **`SELECT … FOR UPDATE`** on wallet row
- Wire **only** `sessions/[id]/actions/route.ts` for `mode === "ai_dm"` when `MONETIZATION_SPEND_ENABLED=true`

**Phase 2 checklist**

- [ ] Price constants in one module
- [ ] Pilot: AI DM deducts **1 Spark** (or table value) per successful AI turn
- [ ] `human_dm`: verify **no** charge on non-AI paths
- [ ] Idempotency verified (retry same action)

---

### Phase 3 — All AI/image routes + host payer

**Deliverables**

- Every inventoried route (§4) calls economy before external APIs
- Payer = `session.host_user_id` (add `payer_user_id` column only if you need override later; default derived is fine)
- Stable **402** JSON: e.g. `{ "code": "insufficient_sparks", "message": "…" }`

**Phase 3 checklist**

- [ ] All table rows in §4 wired
- [ ] Party (`party/submit`, `scene-image`, …) tested
- [ ] Host balance 0 → clear failure; no silent OpenRouter call

---

### Phase 4 — Client UX

**Deliverables**

- Balance visible (HUD / lobby): host-focused + guests see “host funds” copy
- Insufficient Sparks: narrative **pause** state, not raw API errors
- **Buy Sparks** entry (stub URL until Phase 5)

**Phase 4 checklist**

- [ ] Mobile-first ([`Liquid Obsidian`](../src/app/globals.css) tokens)
- [ ] Pusher/session updates if balance affects live UI

---

### Phase 5 — Dodo (shallow)

**Deliverables**

- Server route: create checkout session / payment link for Spark packs
- Webhook route: verify signature, **idempotent** event storage, `credit` transaction + wallet update
- [`.env.example`](../.env.example): Dodo keys, webhook secret, product IDs

**Phase 5 checklist**

- [ ] Staging E2E: pay → webhook → balance increases → spend in game
- [ ] Never credit from browser callback alone
- [ ] Log `external_payment_id` on credit rows

---

### Phase 6 — Profile: slots + portrait debits

**Deliverables**

- `profile/heroes` slot unlock: debit **10 Sparks**
- Portrait reroll: debit after `free_portrait_uses` exhausted; align with existing 402 messages

**Phase 6 checklist**

- [ ] UI copy matches constants
- [ ] Tests or manual QA on profile flows

---

### Phase 7 — Chapters: caps, estimates, presets

**Deliverables**

- Per-chapter: `max_turns`, `system_image_budget`, manual image cooldown
- Lobby: **~Sparks** estimate (Standard / Cinematic preset optional)
- End-of-chapter UX: “Chapter complete” + continue; recap **template-first**, optional short AI behind flag

**Phase 7 checklist**

- [ ] No unbounded turns per chapter
- [ ] Cinematic preset respects image caps

---

### Phase 8 — Optional: session Spark pool

**Deliverables**

- `session_spark_pool` (column or table); contribute API; deduct **pool first, then host**

**Phase 8 checklist**

- [ ] Multiplayer QA: two users contribute; depletion behavior

---

### Phase 9 — Ops: usage + treasury

**Deliverables**

- Log per AI request: model, tokens, est. USD, `spark_charged`, `session_id`
- Alert when OpenRouter (or image) balance low; **treasury gate**: degrade or block **new** heavy sessions

**Phase 9 checklist**

- [ ] Runbook: OR empty, webhook failure, flag rollback
- [ ] Dashboard or logs queryable for margin math

---

### Phase 10 — UGC creator metrics

**Deliverables**

- Creator dashboard: plays, forks, retention proxies — reuse patterns under `src/app/api/internal/world-metrics` / worlds APIs
- **No** creator Sparks accrual yet

**Phase 10 checklist**

- [ ] Featured / moderation hooks if needed

---

### Phase 11 — Optional: internal creator Sparks accrual

**Deliverables**

- Margin-aware split → creator **in-app** balance only; anti-farming rules; **no** cash-out (separate future project)

**Phase 11 checklist**

- [ ] Policy doc + abuse limits before enable

---

## 6. Master implementation checklist (quick view)

Use this alongside per-phase lists above.

- [ ] Phase 0 — Inventory + env flags
- [ ] Phase 1 — Wallet schema + balance read
- [ ] Phase 2 — Economy service + `actions` pilot
- [ ] Phase 3 — Full server coverage + 402 + host payer
- [ ] Phase 4 — Client HUD + pause + Buy entry
- [ ] Phase 5 — Dodo checkout + webhook
- [ ] Phase 6 — Profile slots + portrait
- [ ] Phase 7 — Chapters + estimates
- [ ] Phase 8 — Session pool (optional)
- [ ] Phase 9 — Usage logs + OR alerts + treasury gate
- [ ] Phase 10 — UGC metrics dashboard
- [ ] Phase 11 — Creator accrual (optional, internal only)

---

## 7. External checklist (non-code)

### Dodo

- [ ] Merchant account live; category fits digital goods / game
- [ ] Spark pack products + IDs in config
- [ ] Production webhook URL (HTTPS) + signing secret + idempotent event store
- [ ] Test mode E2E on staging (public URL for webhooks)
- [ ] Refund/chargeback process understood; support contact published

### Infra

- [ ] OpenRouter + image providers funded
- [ ] Alerts on low balance / burn rate

### Legal / policy

- [ ] Terms: virtual currency, non-redeemable, purchase and refund stance
- [ ] Privacy: retention for wallet + usage logs
- [ ] Minors / age gating for purchases if applicable

### Engineering

- [ ] Backup strategy before first prod migration
- [ ] Who toggles `MONETIZATION_SPEND_ENABLED` in prod
- [ ] Rollback / incident runbook

### Analytics

- [ ] Events: pack purchased, sparks depleted, chapter completed (for tuning)

### Explicitly deferred

- [ ] Creator fiat payout, cash-out, cross-border creator tax — future initiative

---

## 8. Spark price table (calibrate before locking)

Store in one module (e.g. `spark-pricing.ts` next to economy service). Revisit after **30d** real usage.

| Action | Initial placeholder | Notes |
| ------ | ------------------- | ----- |
| AI text turn (`ai_dm`) | 1 | Anchor |
| Manual / premium image | 5–10 | vs image COGS |
| System cinematic image | 0 marginal | Cap count per chapter |
| Extra hero slot | 10 | Matches current copy |
| Portrait reroll | 5–10 | After free uses |
| Signup bonus (optional) | 20–50 | Product/marketing |

**Calibration steps**

1. Measure avg USD per text turn and per image (7d rolling).
2. Set target gross margin after MoR fees.
3. Ensure implied **$/Spark** from Dodo packs > worst-case **COGS/Spark** for heaviest preset.

---

## 9. Document control

| Version | Date | Notes |
| ------- | ---- | ----- |
| 1.0 | 2026-04-06 | Initial implementation plan; greenfield; no legacy grandfathering |

Update this file when phases complete or scope changes.
