import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { sparkTransactions, userWallets } from "@/lib/db/schema";

export class InsufficientSparksError extends Error {
  readonly balance: number;
  readonly required: number;

  constructor(balance: number, required: number) {
    super(`Insufficient Sparks (have ${balance}, need ${required})`);
    this.name = "InsufficientSparksError";
    this.balance = balance;
    this.required = required;
  }
}

export function isMonetizationSpendEnabled(): boolean {
  return process.env.MONETIZATION_SPEND_ENABLED === "true";
}

export function isMonetizationDryRunLog(): boolean {
  return process.env.MONETIZATION_DRY_RUN_LOG === "true";
}

export async function getSparkBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({ balance: userWallets.balance })
    .from(userWallets)
    .where(eq(userWallets.user_id, userId))
    .limit(1);
  return row?.balance ?? 0;
}

async function ensureWalletRow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
): Promise<void> {
  await tx.insert(userWallets).values({ user_id: userId }).onConflictDoNothing();
}

/**
 * Debit Sparks from payer. Idempotent: same `idempotencyKey` for user is a no-op on repeat.
 * @returns `applied` true if this call performed a new debit.
 */
export async function tryDebitSparks(params: {
  payerUserId: string;
  amount: number;
  idempotencyKey: string;
  sessionId?: string | null;
  reason: string;
}): Promise<{ applied: boolean; balanceAfter: number }> {
  const {
    payerUserId,
    amount,
    idempotencyKey,
    sessionId = null,
    reason,
  } = params;

  if (amount <= 0) {
    const bal = await getSparkBalance(payerUserId);
    return { applied: false, balanceAfter: bal };
  }

  if (!isMonetizationSpendEnabled()) {
    if (isMonetizationDryRunLog()) {
      console.info(
        "[sparks] dry-run debit skipped",
        JSON.stringify({ payerUserId, amount, idempotencyKey, reason }),
      );
    }
    const bal = await getSparkBalance(payerUserId);
    return { applied: false, balanceAfter: bal };
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sparkTransactions.id })
      .from(sparkTransactions)
      .where(
        and(
          eq(sparkTransactions.user_id, payerUserId),
          eq(sparkTransactions.idempotency_key, idempotencyKey),
        ),
      )
      .limit(1);

    await ensureWalletRow(tx, payerUserId);

    const [locked] = await tx
      .select({ balance: userWallets.balance })
      .from(userWallets)
      .where(eq(userWallets.user_id, payerUserId))
      .for("update")
      .limit(1);

    const current = locked?.balance ?? 0;

    if (existing) {
      return { applied: false, balanceAfter: current };
    }

    if (current < amount) {
      throw new InsufficientSparksError(current, amount);
    }

    const next = current - amount;
    await tx
      .update(userWallets)
      .set({ balance: next, updated_at: new Date() })
      .where(eq(userWallets.user_id, payerUserId));

    await tx.insert(sparkTransactions).values({
      user_id: payerUserId,
      type: "debit",
      amount,
      reason,
      idempotency_key: idempotencyKey,
      session_id: sessionId ?? undefined,
    });

    return { applied: true, balanceAfter: next };
  });
}

/**
 * Credit Sparks (purchase webhook, refunds). Idempotent per user + key.
 */
export async function tryCreditSparks(params: {
  userId: string;
  amount: number;
  idempotencyKey: string;
  sessionId?: string | null;
  reason: string;
  externalPaymentId?: string | null;
}): Promise<{ applied: boolean; balanceAfter: number }> {
  const {
    userId,
    amount,
    idempotencyKey,
    sessionId = null,
    reason,
    externalPaymentId = null,
  } = params;

  if (amount <= 0) {
    const bal = await getSparkBalance(userId);
    return { applied: false, balanceAfter: bal };
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sparkTransactions.id })
      .from(sparkTransactions)
      .where(
        and(
          eq(sparkTransactions.user_id, userId),
          eq(sparkTransactions.idempotency_key, idempotencyKey),
        ),
      )
      .limit(1);

    await ensureWalletRow(tx, userId);

    const [locked] = await tx
      .select({ balance: userWallets.balance })
      .from(userWallets)
      .where(eq(userWallets.user_id, userId))
      .for("update")
      .limit(1);

    const current = locked?.balance ?? 0;

    if (existing) {
      return { applied: false, balanceAfter: current };
    }

    const next = current + amount;
    await tx
      .update(userWallets)
      .set({ balance: next, updated_at: new Date() })
      .where(eq(userWallets.user_id, userId));

    await tx.insert(sparkTransactions).values({
      user_id: userId,
      type: "credit",
      amount,
      reason,
      idempotency_key: idempotencyKey,
      session_id: sessionId ?? undefined,
      external_payment_id: externalPaymentId ?? undefined,
    });

    return { applied: true, balanceAfter: next };
  });
}
