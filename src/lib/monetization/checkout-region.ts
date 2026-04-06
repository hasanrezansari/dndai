import type { NextRequest } from "next/server";

export type CheckoutBillingRegion = "in" | "global";

/**
 * India → Razorpay; everything else → Stripe.
 * Uses `x-vercel-ip-country` / `cf-ipcountry` when present.
 * Override with `CHECKOUT_REGION_OVERRIDE=in|global` for local testing.
 */
export function getCheckoutBillingRegion(
  request: NextRequest,
): CheckoutBillingRegion {
  const override = process.env.CHECKOUT_REGION_OVERRIDE?.trim().toLowerCase();
  if (override === "in" || override === "global") {
    return override;
  }
  const h = request.headers;
  const code =
    h.get("x-vercel-ip-country") ||
    h.get("cf-ipcountry") ||
    h.get("x-country-code") ||
    "";
  return code.trim().toUpperCase() === "IN" ? "in" : "global";
}
