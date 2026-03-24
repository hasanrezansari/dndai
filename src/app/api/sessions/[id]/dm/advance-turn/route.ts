import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { broadcastToSession } from "@/lib/socket/server";
import { assertHumanSessionDm, DmAuthError } from "@/server/services/dm-auth";
import {
  releaseTurnLock,
  resolveHumanDmTurn,
} from "@/server/services/turn-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  turnId: z.string().uuid(),
});

const ADVANCE_COPY = "— The DM advances the turn.";

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

    try {
      const result = await resolveHumanDmTurn({
        sessionId,
        turnId: parsed.data.turnId,
        narrationText: ADVANCE_COPY,
        visibleChanges: [],
      });

      try {
        await broadcastToSession(sessionId, "narration-update", {
          scene_text: result.sceneText,
          visible_changes: result.visibleChanges,
          next_actor: { player_id: result.nextPlayerId },
          event_type: "narration",
        });
      } catch (err) {
        console.error(err);
      }

      await releaseTurnLock(sessionId);

      return NextResponse.json({ ok: true }, { status: 200 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "No turn awaiting DM") {
        return apiError(msg, 409);
      }
      return handleApiError(e);
    }
  } catch (e) {
    return handleApiError(e);
  }
}
