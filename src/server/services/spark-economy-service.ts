import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { sessions, sparkTransactions, userWallets } from "@/lib/db/schema";

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
  metadata?: Record<string, unknown> | null;
}): Promise<{ applied: boolean; balanceAfter: number }> {
  const {
    userId,
    amount,
    idempotencyKey,
    sessionId = null,
    reason,
    externalPaymentId = null,
    metadata = null,
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
      metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
    });

    return { applied: true, balanceAfter: next };
  });
}

/**
 * Debit host wallet for session AI spend, drawing **`sessions.spark_pool_balance` first**, then the host wallet.
 * Idempotent on `(payerUserId, idempotencyKey)` like `tryDebitSparks`.
 */
export async function tryDebitSparksWithSessionPool(params: {
  payerUserId: string;
  amount: number;
  idempotencyKey: string;
  sessionId: string;
  reason: string;
}): Promise<{
  applied: boolean;
  balanceAfter: number;
  fromPool: number;
  fromHost: number;
}> {
  const { payerUserId, amount, idempotencyKey, sessionId, reason } = params;

  if (amount <= 0) {
    const bal = await getSparkBalance(payerUserId);
    return { applied: false, balanceAfter: bal, fromPool: 0, fromHost: 0 };
  }

  if (!isMonetizationSpendEnabled()) {
    if (isMonetizationDryRunLog()) {
      console.info(
        "[sparks] dry-run debit (session pool) skipped",
        JSON.stringify({ payerUserId, amount, idempotencyKey, reason, sessionId }),
      );
    }
    const bal = await getSparkBalance(payerUserId);
    return { applied: false, balanceAfter: bal, fromPool: 0, fromHost: 0 };
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

    const [sessRow] = await tx
      .select({
        spark_pool_balance: sessions.spark_pool_balance,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .for("update")
      .limit(1);

    if (!sessRow) {
      throw new Error("Session not found for spark debit");
    }

    const [locked] = await tx
      .select({ balance: userWallets.balance })
      .from(userWallets)
      .where(eq(userWallets.user_id, payerUserId))
      .for("update")
      .limit(1);

    const hostBalance = locked?.balance ?? 0;
    const poolBalance = sessRow.spark_pool_balance ?? 0;

    if (existing) {
      return {
        applied: false,
        balanceAfter: hostBalance,
        fromPool: 0,
        fromHost: 0,
      };
    }

    const fromPool = Math.min(amount, poolBalance);
    const fromHost = amount - fromPool;

    if (fromHost > hostBalance) {
      throw new InsufficientSparksError(hostBalance, fromHost);
    }

    const nextHost = hostBalance - fromHost;
    const nextPool = poolBalance - fromPool;

    if (fromPool > 0) {
      await tx
        .update(sessions)
        .set({
          spark_pool_balance: nextPool,
          updated_at: new Date(),
        })
        .where(eq(sessions.id, sessionId));
    }

    if (fromHost > 0) {
      await tx
        .update(userWallets)
        .set({ balance: nextHost, updated_at: new Date() })
        .where(eq(userWallets.user_id, payerUserId));
    }

    await tx.insert(sparkTransactions).values({
      user_id: payerUserId,
      type: "debit",
      amount: fromHost,
      reason,
      idempotency_key: idempotencyKey,
      session_id: sessionId,
      metadata: fromPool > 0 ? { spark_pool_used: fromPool } : undefined,
    });

    return {
      applied: true,
      balanceAfter: nextHost,
      fromPool,
      fromHost,
    };
  });
}

/**
 * Refund a session-scoped charge: restore pool first, then credit the host wallet for the remainder.
 * Use `sparkPoolUsed` from the matching `tryDebitSparksWithSessionPool` result when `applied` was true.
 */
export async function tryRefundSessionSparkDebit(params: {
  hostUserId: string;
  sessionId: string;
  totalAmount: number;
  idempotencyKey: string;
  reason: string;
  sparkPoolUsed: number;
}): Promise<void> {
  const {
    hostUserId,
    sessionId,
    totalAmount,
    idempotencyKey,
    reason,
    sparkPoolUsed,
  } = params;

  if (totalAmount <= 0) return;

  const poolRestore = Math.max(0, Math.min(sparkPoolUsed, totalAmount));
  const hostCredit = totalAmount - poolRestore;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sparkTransactions.id })
      .from(sparkTransactions)
      .where(
        and(
          eq(sparkTransactions.user_id, hostUserId),
          eq(sparkTransactions.idempotency_key, idempotencyKey),
        ),
      )
      .limit(1);

    if (existing) return;

    await ensureWalletRow(tx, hostUserId);

    if (poolRestore > 0) {
      await tx
        .update(sessions)
        .set({
          spark_pool_balance: sql`${sessions.spark_pool_balance} + ${poolRestore}`,
          state_version: sql`${sessions.state_version} + 1`,
          updated_at: new Date(),
        })
        .where(eq(sessions.id, sessionId));
    }

    if (hostCredit > 0) {
      const [locked] = await tx
        .select({ balance: userWallets.balance })
        .from(userWallets)
        .where(eq(userWallets.user_id, hostUserId))
        .for("update")
        .limit(1);
      const cur = locked?.balance ?? 0;
      await tx
        .update(userWallets)
        .set({ balance: cur + hostCredit, updated_at: new Date() })
        .where(eq(userWallets.user_id, hostUserId));
    }

    await tx.insert(sparkTransactions).values({
      user_id: hostUserId,
      type: "credit",
      amount: hostCredit,
      reason,
      idempotency_key: idempotencyKey,
      session_id: sessionId,
      metadata:
        poolRestore > 0 ? { spark_pool_restored: poolRestore } : undefined,
    });
  });
}

/**
 * Move Sparks from a contributor's wallet into the session pool (for shared table funding).
 */
export async function contributeToSessionSparkPool(params: {
  contributorUserId: string;
  sessionId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<{
  applied: boolean;
  balanceAfter: number;
  poolAfter: number;
}> {
  const { contributorUserId, sessionId, amount, idempotencyKey } = params;

  if (amount <= 0) {
    const bal = await getSparkBalance(contributorUserId);
    const [s] = await db
      .select({ spark_pool_balance: sessions.spark_pool_balance })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return {
      applied: false,
      balanceAfter: bal,
      poolAfter: s?.spark_pool_balance ?? 0,
    };
  }

  if (!isMonetizationSpendEnabled()) {
    if (isMonetizationDryRunLog()) {
      console.info(
        "[sparks] dry-run pool contribute skipped",
        JSON.stringify({ contributorUserId, amount, sessionId, idempotencyKey }),
      );
    }
    const bal = await getSparkBalance(contributorUserId);
    const [s] = await db
      .select({ spark_pool_balance: sessions.spark_pool_balance })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    return {
      applied: false,
      balanceAfter: bal,
      poolAfter: s?.spark_pool_balance ?? 0,
    };
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: sparkTransactions.id })
      .from(sparkTransactions)
      .where(
        and(
          eq(sparkTransactions.user_id, contributorUserId),
          eq(sparkTransactions.idempotency_key, idempotencyKey),
        ),
      )
      .limit(1);

    const [sessRow] = await tx
      .select({ spark_pool_balance: sessions.spark_pool_balance })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .for("update")
      .limit(1);

    if (!sessRow) {
      throw new Error("Session not found");
    }

    await ensureWalletRow(tx, contributorUserId);

    const [locked] = await tx
      .select({ balance: userWallets.balance })
      .from(userWallets)
      .where(eq(userWallets.user_id, contributorUserId))
      .for("update")
      .limit(1);

    const cur = locked?.balance ?? 0;

    if (existing) {
      return {
        applied: false,
        balanceAfter: cur,
        poolAfter: sessRow.spark_pool_balance,
      };
    }

    if (cur < amount) {
      throw new InsufficientSparksError(cur, amount);
    }

    const nextBal = cur - amount;
    const nextPool = sessRow.spark_pool_balance + amount;

    await tx
      .update(userWallets)
      .set({ balance: nextBal, updated_at: new Date() })
      .where(eq(userWallets.user_id, contributorUserId));

    await tx
      .update(sessions)
      .set({
        spark_pool_balance: nextPool,
        state_version: sql`${sessions.state_version} + 1`,
        updated_at: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    await tx.insert(sparkTransactions).values({
      user_id: contributorUserId,
      type: "debit",
      amount,
      reason: "session_spark_pool_contribute",
      idempotency_key: idempotencyKey,
      session_id: sessionId,
    });

    return {
      applied: true,
      balanceAfter: nextBal,
      poolAfter: nextPool,
    };
  });
}
