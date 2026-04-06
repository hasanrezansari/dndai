import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/monetization/stripe-checkout";
import { creditSparksForPackPurchase } from "@/server/services/spark-purchase-credit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("stripe-signature");
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!whSecret || !sig) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET or signature missing");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (e) {
    console.warn("[stripe webhook] signature verification failed", e);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.ashveil_user_id?.trim();
    const packId = session.metadata?.ashveil_pack_id?.trim();
    if (userId && packId) {
      const pi = session.payment_intent;
      const extId =
        typeof pi === "string"
          ? pi
          : pi &&
              typeof pi === "object" &&
              pi !== null &&
              "id" in pi &&
              typeof (pi as { id: string }).id === "string"
            ? (pi as { id: string }).id
            : session.id;
      try {
        const { credited } = await creditSparksForPackPurchase({
          userId,
          packId,
          externalPaymentId: extId,
          source: "stripe",
        });
        if (!credited) {
          console.warn("[stripe webhook] credit not applied", session.id);
        }
      } catch (err) {
        console.error("[stripe webhook] credit error", err);
        return new NextResponse("Credit failed", { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
