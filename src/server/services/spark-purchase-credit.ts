import { getSparkPackById } from "@/lib/monetization/spark-packs";
import { tryCreditSparks } from "@/server/services/spark-economy-service";

export type SparkPurchaseSource = "stripe" | "razorpay" | "dodo";

/**
 * Idempotent credit after a verified external payment (webhook or confirm fallback).
 */
export async function creditSparksForPackPurchase(params: {
  userId: string;
  packId: string;
  externalPaymentId: string;
  source: SparkPurchaseSource;
}): Promise<{ credited: boolean }> {
  const pack = getSparkPackById(params.packId);
  if (!pack) {
    return { credited: false };
  }

  const result = await tryCreditSparks({
    userId: params.userId,
    amount: pack.sparks,
    idempotencyKey: `${params.source}:payment:${params.externalPaymentId}`,
    reason: `${params.source}_purchase`,
    externalPaymentId: params.externalPaymentId,
    metadata: {
      source: params.source,
      pack_id: pack.packId,
    },
  });

  return { credited: result.applied };
}
