import { and, desc, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { determineResult, rollWithAdvantage } from "@/lib/rules/dice";
import { DiceTypeSchema } from "@/lib/schemas/enums";
import { db } from "@/lib/db";
import { turns } from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";
import { assertHumanSessionDm, DmAuthError } from "@/server/services/dm-auth";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  diceType: DiceTypeSchema.default("d20"),
  context: z.string().min(1).max(200).default("DM Roll"),
  modifier: z.number().int().min(-50).max(50).default(0),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }

    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }

    try {
      await assertHumanSessionDm(
        sessionId,
        parsed.data.playerId,
        user.id,
      );
    } catch (e) {
      if (e instanceof DmAuthError) {
        return apiError(e.message, 403);
      }
      throw e;
    }

    const diceType = parsed.data.diceType;
    const { value } = rollWithAdvantage(diceType, "none");
    const total = value + parsed.data.modifier;
    const result = determineResult(total, 10, value, diceType);

    const [openTurn] = await db
      .select({ id: turns.id, round_number: turns.round_number })
      .from(turns)
      .where(
        and(
          eq(turns.session_id, sessionId),
          inArray(turns.status, ["awaiting_input", "processing", "awaiting_dm"]),
        ),
      )
      .orderBy(desc(turns.started_at))
      .limit(1);

    try {
      await broadcastToSession(sessionId, "dice-result", {
        dice_type: diceType,
        roll_value: value,
        modifier: parsed.data.modifier,
        total,
        result,
        context: parsed.data.context,
        ...(openTurn
          ? { turn_id: openTurn.id, round_number: openTurn.round_number }
          : {}),
      });
    } catch (err) {
      console.error(err);
    }

    return NextResponse.json(
      {
        dice_type: diceType,
        roll_value: value,
        modifier: parsed.data.modifier,
        total,
        result,
      },
      { status: 200 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
