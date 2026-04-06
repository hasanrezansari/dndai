import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { getCheckoutBillingRegion } from "@/lib/monetization/checkout-region";
import { createRazorpaySparkOrder } from "@/lib/monetization/razorpay-order";
import {
  getPublicRazorpayKeyId,
  getPublicSparkPacks,
  getSparkPackById,
  getSparkPackCatalog,
  isSparkCheckoutConfigured,
} from "@/lib/monetization/spark-packs";
import { createStripeSparkCheckoutSession } from "@/lib/monetization/stripe-checkout";

export const dynamic = "force-dynamic";

const postBodySchema = z.object({
  packId: z.string().min(1).max(64),
});

function appOrigin(): string {
  return (
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

/** Public pack list + whether server can start checkout (Stripe + Razorpay + catalog). */
export async function GET() {
  const catalog = getSparkPackCatalog();
  const checkoutEnabled = isSparkCheckoutConfigured();
  return NextResponse.json({
    checkoutEnabled,
    packs: getPublicSparkPacks(),
  });
}

/**
 * Starts checkout: India → Razorpay order (+ client opens Checkout.js);
 * global → Stripe Checkout redirect. No provider names in response keys.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  if (!isSparkCheckoutConfigured()) {
    return NextResponse.json(
      { error: "Checkout is not configured" },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const pack = getSparkPackById(parsed.data.packId);
  if (!pack) {
    return NextResponse.json({ error: "Unknown pack" }, { status: 400 });
  }

  const email = user.email?.trim();
  if (!email) {
    return NextResponse.json(
      { error: "Account email required for checkout" },
      { status: 400 },
    );
  }

  const region = getCheckoutBillingRegion(request);
  const origin = appOrigin();
  const successUrl = `${origin}/shop/success`;
  const cancelUrl = `${origin}/shop`;

  if (region === "in") {
    const rzKey = getPublicRazorpayKeyId();
    if (!rzKey) {
      return NextResponse.json(
        { error: "Checkout is not configured" },
        { status: 503 },
      );
    }

    const receipt = `spk_${pack.packId}_${Date.now()}`.slice(0, 40);
    const order = await createRazorpaySparkOrder({
      userId: user.id,
      packId: pack.packId,
      amountPaise: pack.razorpayAmountPaise,
      receipt,
    });

    return NextResponse.json({
      flow: "razorpay",
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: rzKey,
      prefill: {
        email,
        name: user.name?.trim() || undefined,
      },
      /** Display copy only — not a provider name. */
      displayName: pack.label,
      successRedirectBase: successUrl,
    });
  }

  const session = await createStripeSparkCheckoutSession({
    userId: user.id,
    email,
    name: user.name?.trim() || undefined,
    packId: pack.packId,
    stripePriceId: pack.stripePriceId,
    successUrl: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl,
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "Could not start checkout" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    flow: "stripe_redirect",
    checkoutUrl: session.url,
  });
}
