import { randomUUID } from "crypto";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError, insufficientSparksResponse } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import {
  contributeToSessionSparkPool,
  InsufficientSparksError,
  isMonetizationSpendEnabled,
} from "@/server/services/spark-economy-service";
import { broadcastToSession } from "@/lib/socket/server";

const BodySchema = z.object({
  amount: z.number().int().min(1).max(10_000),
  idempotency_key: z.string().min(8).max(128).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    if (!(await isSessionMember(sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    if (!isMonetizationSpendEnabled()) {
      return apiError("Sparks spending is not enabled", 409);
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    const idempotencyKey =
      parsed.data.idempotency_key ??
      `pool_contrib:${sessionId}:${user.id}:${randomUUID()}`;

    try {
      const r = await contributeToSessionSparkPool({
        contributorUserId: user.id,
        sessionId,
        amount: parsed.data.amount,
        idempotencyKey,
      });

      const [fresh] = await db
        .select({ state_version: sessions.state_version })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);

      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: [],
          state_version: fresh?.state_version ?? 0,
        });
      } catch (err) {
        console.error(err);
      }

      return NextResponse.json({
        ok: true,
        applied: r.applied,
        balance_after: r.balanceAfter,
        pool_after: r.poolAfter,
        state_version: fresh?.state_version ?? 0,
      });
    } catch (e) {
      if (e instanceof InsufficientSparksError) {
        return insufficientSparksResponse({
          balance: e.balance,
          required: e.required,
        });
      }
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}
