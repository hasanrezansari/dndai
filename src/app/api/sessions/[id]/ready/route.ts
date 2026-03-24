import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { broadcastToSession } from "@/lib/socket/server";
import {
  PlayerNotFoundError,
  toggleReady,
} from "@/server/services/session-service";

const ReadyBodySchema = z.object({
  playerId: z.string().uuid(),
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
    const json: unknown = await request.json();
    const parsed = ReadyBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }
    if (
      !(await isPlayerForUser(parsed.data.playerId, sessionId, user.id))
    ) {
      return apiError("Forbidden", 403);
    }
    const isReady = await toggleReady(parsed.data.playerId, sessionId);
    try {
      await broadcastToSession(sessionId, "player-ready", {
        player_id: parsed.data.playerId,
        is_ready: isReady,
      });
    } catch (err) {
      console.error(err);
    }
    return NextResponse.json({ isReady });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return apiError("Not found", 404);
    }
    return handleApiError(e);
  }
}
