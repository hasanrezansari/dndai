import { createHmac, timingSafeEqual } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { creditSparksForPackPurchase } from "@/server/services/spark-purchase-credit";

export const dynamic = "force-dynamic";

function verifyRazorpaySignature(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sig = request.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[razorpay webhook] RAZORPAY_WEBHOOK_SECRET missing");
    return new NextResponse("Not configured", { status: 500 });
  }
  if (!verifyRazorpaySignature(rawBody, sig, secret)) {
    console.warn("[razorpay webhook] signature verification failed");
    return new NextResponse("Invalid signature", { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const event = String(payload.event ?? "");
  if (event !== "payment.captured") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const paymentPayload = payload.payload as Record<string, unknown> | undefined;
  const paymentWrap = paymentPayload?.payment as Record<string, unknown> | undefined;
  const entity = paymentWrap?.entity as Record<string, unknown> | undefined;
  if (!entity) {
    return NextResponse.json({ ok: true });
  }

  const paymentId = typeof entity.id === "string" ? entity.id : "";
  const notes = entity.notes as Record<string, unknown> | undefined;
  const userId =
    typeof notes?.ashveil_user_id === "string" ? notes.ashveil_user_id.trim() : "";
  const packId =
    typeof notes?.ashveil_pack_id === "string" ? notes.ashveil_pack_id.trim() : "";

  if (paymentId && userId && packId) {
    try {
      const { credited } = await creditSparksForPackPurchase({
        userId,
        packId,
        externalPaymentId: paymentId,
        source: "razorpay",
      });
      if (!credited) {
        console.warn("[razorpay webhook] credit not applied", paymentId);
      }
    } catch (err) {
      console.error("[razorpay webhook] credit error", err);
      return new NextResponse("Credit failed", { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
