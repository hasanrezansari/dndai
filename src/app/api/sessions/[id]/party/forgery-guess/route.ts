import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import {
  applyPartyForgeryGuessAndMaybeAdvance,
  tryPartyForgeryGuessDeadlineAdvance,
} from "@/server/services/party-phase-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  slotId: z.string().min(1).max(80),
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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    if (
      !(await isPlayerForUser(parsed.data.playerId, sessionId, user.id))
    ) {
      return apiError("Forbidden", 403);
    }

    await tryPartyForgeryGuessDeadlineAdvance(sessionId);

    const result = await applyPartyForgeryGuessAndMaybeAdvance({
      sessionId,
      playerId: parsed.data.playerId,
      slotId: parsed.data.slotId,
    });

    if (!result.ok) {
      return apiError(result.error, result.status);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
