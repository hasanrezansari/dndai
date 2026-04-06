import {
  getDodoCheckoutSession,
  getDodoPayment,
} from "@/lib/monetization/dodo-client";
import {
  getSparkPackById,
  sparksForProductId,
} from "@/lib/monetization/spark-packs";
import { tryCreditSparks } from "@/server/services/spark-economy-service";

export type DodoPaymentLike = {
  payment_id?: string;
  id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  product_cart?: Array<{ product_id?: string; quantity?: number }>;
};

const PAID_STATUSES = new Set(["paid", "succeeded", "completed"]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Normalize assorted Dodo webhook / API shapes into a single payment-like object.
 */
export function extractPaymentFromWebhookPayload(
  payload: Record<string, unknown>,
): DodoPaymentLike | null {
  const data = asRecord(payload.data);
  if (data) {
    const inner = asRecord(data.object) ?? data;
    if (inner.payment_id || inner.id) return inner as DodoPaymentLike;
  }
  if (payload.payment_id || payload.id) return payload as DodoPaymentLike;
  return null;
}

export function webhookEventType(payload: Record<string, unknown>): string {
  return String(payload.type ?? payload.event_type ?? "");
}

/**
 * Merge checkout session + optional payment fetch into a structure `creditSparksIfPaid` understands.
 */
export function paymentLikeFromCheckoutSession(
  session: Record<string, unknown>,
  paymentOverride?: Record<string, unknown> | null,
): DodoPaymentLike {
  const pay = paymentOverride ?? {};
  const metadata =
    (asRecord(pay.metadata) as Record<string, unknown> | undefined) ??
    (asRecord(session.metadata) as Record<string, unknown> | undefined) ??
    {};
  const product_cart =
    (Array.isArray(pay.product_cart) ? pay.product_cart : null) ??
    (Array.isArray(session.product_cart) ? session.product_cart : null) ??
    [];
  return {
    payment_id:
      (typeof pay.payment_id === "string" && pay.payment_id) ||
      (typeof pay.id === "string" && pay.id) ||
      (typeof session.payment_id === "string" && session.payment_id) ||
      (typeof session.latest_payment_id === "string" &&
        session.latest_payment_id) ||
      undefined,
    status:
      (typeof pay.status === "string" && pay.status) ||
      (typeof session.status === "string" && session.status) ||
      undefined,
    metadata,
    product_cart: product_cart as DodoPaymentLike["product_cart"],
  };
}

/**
 * Load payment fields from Dodo for the post-checkout / localhost confirm flow.
 */
export async function resolvePaymentLikeForConfirm(params: {
  sessionId?: string | null;
  paymentId?: string | null;
}): Promise<DodoPaymentLike | null> {
  const sessionId = params.sessionId?.trim() || null;
  const paymentId = params.paymentId?.trim() || null;

  if (paymentId) {
    const { ok, data } = await getDodoPayment(paymentId);
    if (!ok) return null;
    return {
      payment_id:
        (typeof data.payment_id === "string" && data.payment_id) || paymentId,
      id: (typeof data.id === "string" && data.id) || paymentId,
      status: typeof data.status === "string" ? data.status : undefined,
      metadata: (asRecord(data.metadata) ?? undefined) as
        | Record<string, unknown>
        | undefined,
      product_cart: Array.isArray(data.product_cart)
        ? (data.product_cart as DodoPaymentLike["product_cart"])
        : [],
    };
  }

  if (sessionId) {
    const { ok, data } = await getDodoCheckoutSession(sessionId);
    if (!ok) return null;
    const embedded =
      (typeof data.payment_id === "string" && data.payment_id) ||
      (typeof data.latest_payment_id === "string" && data.latest_payment_id) ||
      null;
    let payExtra: Record<string, unknown> | null = null;
    if (embedded) {
      const pr = await getDodoPayment(embedded);
      if (pr.ok) payExtra = pr.data;
    }
    return paymentLikeFromCheckoutSession(data, payExtra);
  }

  return null;
}

/**
 * Credit Sparks after a verified paid Dodo payment (webhook or confirm fallback).
 * Idempotent on `payment_id` / `id`.
 */
export async function creditSparksIfPaid(
  payment: DodoPaymentLike,
): Promise<{ credited: boolean; reason?: string }> {
  const status = payment.status?.toLowerCase() ?? "";
  if (!PAID_STATUSES.has(status)) {
    return { credited: false, reason: "not_paid" };
  }

  const paymentId = payment.payment_id || payment.id;
  if (!paymentId || typeof paymentId !== "string") {
    return { credited: false, reason: "no_payment_id" };
  }

  const userIdRaw = payment.metadata?.ashveil_user_id;
  const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : "";
  if (!userId) {
    return { credited: false, reason: "no_user_in_metadata" };
  }

  const cart = payment.product_cart;
  if (!Array.isArray(cart) || cart.length === 0) {
    return { credited: false, reason: "no_product_cart" };
  }

  let totalSparks = 0;
  for (const line of cart) {
    const pid =
      line && typeof line === "object" && typeof line.product_id === "string"
        ? line.product_id
        : null;
    if (!pid) continue;
    const qtyRaw = line.quantity;
    const qty = Math.min(
      99,
      Math.max(1, typeof qtyRaw === "number" && qtyRaw > 0 ? qtyRaw : 1),
    );
    const perPack = sparksForProductId(pid);
    if (perPack == null) {
      console.warn("[dodo] unknown product_id in payment cart", pid);
      return { credited: false, reason: "unknown_product" };
    }
    totalSparks += perPack * qty;
  }

  if (totalSparks <= 0) {
    const packHint =
      typeof payment.metadata?.ashveil_pack_id === "string"
        ? payment.metadata.ashveil_pack_id
        : "";
    const pack = packHint ? getSparkPackById(packHint) : undefined;
    if (pack) totalSparks = pack.sparks;
  }

  if (totalSparks <= 0) {
    return { credited: false, reason: "zero_sparks" };
  }

  const idempotencyKey = `dodo:payment:${paymentId}`;
  const result = await tryCreditSparks({
    userId,
    amount: totalSparks,
    idempotencyKey,
    reason: "dodo_purchase",
    externalPaymentId: paymentId,
    metadata: {
      source: "dodo",
      ...(typeof payment.metadata?.ashveil_pack_id === "string"
        ? { pack_id: payment.metadata.ashveil_pack_id }
        : {}),
    },
  });

  return { credited: result.applied };
}
