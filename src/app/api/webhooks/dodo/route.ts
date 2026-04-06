import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";

import {
  creditSparksIfPaid,
  extractPaymentFromWebhookPayload,
  webhookEventType,
} from "@/server/services/dodo-spark-purchase-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dodo Payments → Standard Webhooks signed events.
 * Configure URL in dashboard: `https://<your-domain>/api/webhooks/dodo`
 */
export async function POST(request: NextRequest) {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[dodo webhook] DODO_PAYMENTS_WEBHOOK_SECRET missing");
    return NextResponse.json(
      { error: "Webhooks not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const wh = new Webhook(secret);

  let payload: Record<string, unknown>;
  try {
    payload = wh.verify(rawBody, {
      "webhook-id": request.headers.get("webhook-id") ?? "",
      "webhook-signature": request.headers.get("webhook-signature") ?? "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
    }) as Record<string, unknown>;
  } catch (e) {
    console.warn("[dodo webhook] signature verification failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventType = webhookEventType(payload);
  if (
    eventType === "payment.succeeded" ||
    eventType === "payment_intent.succeeded"
  ) {
    const payment = extractPaymentFromWebhookPayload(payload);
    if (payment) {
      const result = await creditSparksIfPaid(payment);
      if (!result.credited && result.reason && result.reason !== "not_paid") {
        console.info(
          "[dodo webhook] credit not applied",
          result.reason,
          eventType,
        );
      }
    } else {
      console.warn("[dodo webhook] could not parse payment from payload");
    }
  }

  return NextResponse.json({ received: true });
}
