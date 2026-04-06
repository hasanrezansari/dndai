import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

export async function createStripeSparkCheckoutSession(params: {
  userId: string;
  email: string;
  name: string | undefined;
  packId: string;
  stripePriceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string | null; sessionId: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: params.stripePriceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.email,
    metadata: {
      ashveil_user_id: params.userId,
      ashveil_pack_id: params.packId,
    },
  });
  return { url: session.url, sessionId: session.id };
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
}
