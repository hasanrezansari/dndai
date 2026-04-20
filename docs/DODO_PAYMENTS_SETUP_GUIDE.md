# Dodo Payments Setup Guide (Ashveil)

This guide explains exactly what you need to configure so Dodo checkout works reliably in Ashveil.

It is written as a practical runbook: do Step 1, then Step 2, and so on.

---

## Step 1: Understand what must exist before checkout can work

Your codebase uses:

- Dodo for **global checkout**.
- Razorpay for **India checkout**.
- A shared pack catalog (`SPARK_PACKS_JSON`) with Dodo mapping required. Razorpay pricing is optional.

Important implication:

- Dodo can now run standalone. Razorpay is only used for India when fully configured.

---

## Step 2: Create products in Dodo Dashboard (Test mode first)

In Dodo Dashboard:

1. Switch to **Test mode**.
2. Create one product per spark pack you want to sell.
3. Copy each product ID (looks like `prod_...`).

Example mapping you should maintain:

- Starter pack -> `prod_test_aaa`
- Hero pack -> `prod_test_bbb`
- Legend pack -> `prod_test_ccc`

Rule:

- One Ashveil pack = one Dodo product ID.

---

## Step 3: Generate Dodo API key (Test mode)

In Dodo Dashboard:

1. Go to `Developer -> API`.
2. Create API key.
3. Copy it immediately.

Set this env var:

- `DODO_PAYMENTS_API_KEY=<your_test_api_key>`

Also set:

- `DODO_PAYMENTS_ENV=test`

Your code will automatically call:

- `https://test.dodopayments.com` when env is `test`
- `https://live.dodopayments.com` when env is `live`

---

## Step 4: Configure Dodo webhook endpoint

In Dodo Dashboard:

1. Go to `Developer -> Webhooks`.
2. Create endpoint URL:
   - Local testing (with tunnel): `https://<your-tunnel-domain>/api/webhooks/dodo`
   - Production: `https://<your-domain>/api/webhooks/dodo`
3. Subscribe to at least:
   - `payment.succeeded`
   - `payment_intent.succeeded`
4. Copy webhook secret.

Set this env var:

- `DODO_PAYMENTS_WEBHOOK_SECRET=<your_webhook_secret>`

Security note:

- Your app verifies Standard Webhooks headers (`webhook-id`, `webhook-signature`, `webhook-timestamp`).
- Do not expose webhook secret on client side.

---

## Step 5: Define your spark pack catalog correctly

You must set `SPARK_PACKS_JSON` with complete pack rows.

Each row requires:

- `packId` (internal stable id)
- `label` (UI label)
- `sparks` (credited amount)
- `dodoProductId` (from Dodo)
- `razorpayAmountPaise` (optional; only needed if you want Razorpay path for India)

Example:

```json
SPARK_PACKS_JSON=[
  {
    "packId":"starter",
    "label":"Starter",
    "sparks":500,
    "dodoProductId":"prod_test_aaa",
    "razorpayAmountPaise":49900
  },
  {
    "packId":"hero",
    "label":"Hero",
    "sparks":1500,
    "dodoProductId":"prod_test_bbb",
    "razorpayAmountPaise":129900
  },
  {
    "packId":"legend",
    "label":"Legend",
    "sparks":5000,
    "dodoProductId":"prod_test_ccc",
    "razorpayAmountPaise":399900
  }
]
```

Notes:

- `49900` means INR `499.00`.
- If `dodoProductId` is wrong/missing, Dodo checkout fails.
- If the product does not exist in the active Dodo environment (test/live), checkout fails.

---

## Step 6: Razorpay is optional

Only configure Razorpay if you want India-specific Razorpay checkout:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `RAZORPAY_WEBHOOK_SECRET`

If missing, checkout still works via Dodo redirect.

---

## Step 7: Add/update env vars in local and production

### Local `.env.local`

Set:

- `DODO_PAYMENTS_API_KEY`
- `DODO_PAYMENTS_ENV=test`
- `DODO_PAYMENTS_WEBHOOK_SECRET`
- `SPARK_PACKS_JSON`
- Razorpay vars only if you want India Razorpay flow

Then restart app.

### Production (Vercel)

Set same vars in project Environment Variables.

Use production domain for webhook URL in Dodo dashboard.

---

## Step 8: Test end-to-end in Test mode

Run this full test:

1. Open shop and start checkout for one pack.
2. Confirm API returns Dodo redirect checkout URL.
3. Complete payment in Dodo test checkout.
4. Verify webhook delivery is successful in Dodo dashboard logs.
5. Verify sparks are credited to the expected user.

If sparks not credited, check:

- Webhook secret mismatch.
- Missing `ashveil_user_id` metadata.
- Event type not subscribed.
- `SPARK_PACKS_JSON` missing mapping for product.

---

## Step 9: Move to Live mode safely

Dodo test and live are isolated. You must repeat setup in live.

Do this:

1. Switch Dodo dashboard to **Live mode**.
2. Create/copy products in live (new `prod_...` ids).
3. Generate live API key.
4. Create live webhook endpoint.
5. Copy live webhook secret.
6. Update env:
   - `DODO_PAYMENTS_ENV=live`
   - `DODO_PAYMENTS_API_KEY=<live_key>`
   - `DODO_PAYMENTS_WEBHOOK_SECRET=<live_secret>`
   - Replace `SPARK_PACKS_JSON` `dodoProductId`s with live IDs

Then redeploy/restart and run a small real-payment smoke test.

---

## Step 10: Quick troubleshooting matrix

### Error: "Checkout is not configured"

Check:

- `SPARK_PACKS_JSON` is valid JSON and non-empty.
- Every pack has `dodoProductId`.
- Dodo API key present.
- If you expect Razorpay in India, ensure Razorpay vars are present and pack includes `razorpayAmountPaise`.

### Dodo checkout created but no sparks credited

Check:

- Webhook endpoint reachable.
- Webhook secret matches env.
- Subscribed events include success events.
- Payment status is paid/succeeded/completed.
- Product IDs in payment cart map to your `SPARK_PACKS_JSON`.

### Works in test, fails in live

Most common causes:

- Still using test product IDs in `SPARK_PACKS_JSON`.
- Still using test API key/secret.
- `DODO_PAYMENTS_ENV` not switched to `live`.

---

## Step 11: Minimal env template (copy and fill)

```env
# Dodo
DODO_PAYMENTS_API_KEY=
DODO_PAYMENTS_ENV=test
DODO_PAYMENTS_WEBHOOK_SECRET=

# Shared checkout catalog
SPARK_PACKS_JSON=

# Razorpay (optional; only for India-specific Razorpay flow)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_WEBHOOK_SECRET=
```

---

## Step 12: Go-live checklist

- [ ] Dodo products created in live mode
- [ ] Live API key set
- [ ] Live webhook endpoint configured
- [ ] Live webhook secret set
- [ ] `DODO_PAYMENTS_ENV=live`
- [ ] `SPARK_PACKS_JSON` uses live `dodoProductId`s
- [ ] Razorpay env vars valid (only if using Razorpay flow)
- [ ] Successful real-payment smoke test completed

