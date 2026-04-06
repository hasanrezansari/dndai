import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { getRazorpay } from "@/lib/monetization/razorpay-order";
import { retrieveStripeCheckoutSession } from "@/lib/monetization/stripe-checkout";
import {
  creditSparksIfPaid,
  resolvePaymentLikeForConfirm,
} from "@/server/services/dodo-spark-purchase-service";
import { creditSparksForPackPurchase } from "@/server/services/spark-purchase-credit";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    paymentId: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.sessionId?.trim() || b.paymentId?.trim()), {
    message: "sessionId or paymentId required",
  });

/**
 * Fallback when webhooks are delayed (localhost) — Stripe session, Razorpay payment, or legacy Dodo.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sessionId = parsed.data.sessionId?.trim() || null;
  const paymentId = parsed.data.paymentId?.trim() || null;

  if (sessionId?.startsWith("cs_")) {
    try {
      const session = await retrieveStripeCheckoutSession(sessionId);
      if (session.metadata?.ashveil_user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const status = session.payment_status?.toLowerCase() ?? "";
      if (status !== "paid") {
        return NextResponse.json({
          credited: false,
          reason: "not_paid",
        });
      }
      const packId = session.metadata?.ashveil_pack_id?.trim();
      if (!packId) {
        return NextResponse.json({ error: "Invalid session" }, { status: 400 });
      }
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
      const result = await creditSparksForPackPurchase({
        userId: user.id,
        packId,
        externalPaymentId: extId,
        source: "stripe",
      });
      return NextResponse.json({
        credited: result.credited,
        reason: null,
      });
    } catch (e) {
      console.error("[confirm] stripe session", e);
      return NextResponse.json(
        { error: "Could not confirm payment" },
        { status: 502 },
      );
    }
  }

  if (paymentId?.startsWith("pay_")) {
    try {
      const rzp = getRazorpay();
      const pay = await rzp.payments.fetch(paymentId);
      const st = String(pay.status ?? "").toLowerCase();
      if (st !== "captured") {
        return NextResponse.json({
          credited: false,
          reason: "not_paid",
        });
      }
      const notes = pay.notes as Record<string, unknown> | undefined;
      const uid =
        typeof notes?.ashveil_user_id === "string" ? notes.ashveil_user_id : "";
      const packId =
        typeof notes?.ashveil_pack_id === "string" ? notes.ashveil_pack_id : "";
      if (uid !== user.id || !packId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const result = await creditSparksForPackPurchase({
        userId: user.id,
        packId,
        externalPaymentId: paymentId,
        source: "razorpay",
      });
      return NextResponse.json({
        credited: result.credited,
        reason: null,
      });
    } catch (e) {
      console.error("[confirm] razorpay payment", e);
      return NextResponse.json(
        { error: "Could not confirm payment" },
        { status: 502 },
      );
    }
  }

  const payment = await resolvePaymentLikeForConfirm({
    sessionId,
    paymentId,
  });

  if (!payment) {
    return NextResponse.json(
      { error: "Could not load payment" },
      { status: 404 },
    );
  }

  const metaUser = payment.metadata?.ashveil_user_id;
  if (typeof metaUser !== "string" || metaUser !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await creditSparksIfPaid(payment);
  return NextResponse.json({
    credited: result.credited,
    reason: result.reason ?? null,
  });
}
