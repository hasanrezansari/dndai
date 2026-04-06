import { randomUUID } from "crypto";

import { insufficientSparksResponse } from "@/lib/api/errors";
import { SPARK_COST_PORTRAIT_GENERATION } from "@/lib/spark-pricing";
import {
  InsufficientSparksError,
  isMonetizationSpendEnabled,
  tryCreditSparks,
  tryDebitSparks,
} from "@/server/services/spark-economy-service";
import {
  assertAndConsumeFreePortraitUse,
  PortraitPaymentRequiredError,
} from "@/server/services/profile-hero-service";

export type PortraitSparkGateResult =
  | { ok: true; paidIdempotencyKey: string | null }
  | { ok: false; response: Response };

/**
 * Resolves free portrait use or debits Sparks for paid generation/reroll.
 * When `reroll` is true, skips free tier and charges Sparks (when spend enabled).
 */
export async function gatePortraitWithSparks(params: {
  userId: string;
  reroll: boolean;
  /** Prefix for idempotency keys, e.g. `char` or `hero:${heroId}` */
  keyPrefix: string;
}): Promise<PortraitSparkGateResult> {
  const { userId, reroll, keyPrefix } = params;

  if (reroll) {
    if (!isMonetizationSpendEnabled()) {
      return {
        ok: false,
        response: Response.json(
          { error: "Portrait reroll costs Sparks" },
          { status: 402 },
        ),
      };
    }
    const idempotencyKey = `portrait_${keyPrefix}_reroll:${userId}:${randomUUID()}`;
    try {
      await tryDebitSparks({
        payerUserId: userId,
        amount: SPARK_COST_PORTRAIT_GENERATION,
        idempotencyKey,
        sessionId: null,
        reason: "portrait_reroll",
      });
      return { ok: true, paidIdempotencyKey: idempotencyKey };
    } catch (e) {
      if (e instanceof InsufficientSparksError) {
        return {
          ok: false,
          response: insufficientSparksResponse({
            balance: e.balance,
            required: e.required,
          }),
        };
      }
      throw e;
    }
  }

  try {
    await assertAndConsumeFreePortraitUse(userId);
    return { ok: true, paidIdempotencyKey: null };
  } catch (e) {
    if (!(e instanceof PortraitPaymentRequiredError)) {
      throw e;
    }
    if (!isMonetizationSpendEnabled()) {
      return {
        ok: false,
        response: Response.json(
          { error: "Portrait generation costs Sparks" },
          { status: 402 },
        ),
      };
    }
    const idempotencyKey = `portrait_${keyPrefix}:${userId}:${randomUUID()}`;
    try {
      await tryDebitSparks({
        payerUserId: userId,
        amount: SPARK_COST_PORTRAIT_GENERATION,
        idempotencyKey,
        sessionId: null,
        reason: "portrait_generation",
      });
      return { ok: true, paidIdempotencyKey: idempotencyKey };
    } catch (sparkErr) {
      if (sparkErr instanceof InsufficientSparksError) {
        return {
          ok: false,
          response: insufficientSparksResponse({
            balance: sparkErr.balance,
            required: sparkErr.required,
          }),
        };
      }
      throw sparkErr;
    }
  }
}

export async function refundPortraitSparksIfNeeded(params: {
  userId: string;
  paidIdempotencyKey: string | null;
}): Promise<void> {
  const { userId, paidIdempotencyKey } = params;
  if (!paidIdempotencyKey || !isMonetizationSpendEnabled()) return;
  try {
    await tryCreditSparks({
      userId,
      amount: SPARK_COST_PORTRAIT_GENERATION,
      idempotencyKey: `refund:${paidIdempotencyKey}`,
      sessionId: null,
      reason: "refund_portrait_failed",
    });
  } catch (e) {
    console.error("[sparks] portrait refund failed", e);
  }
}
