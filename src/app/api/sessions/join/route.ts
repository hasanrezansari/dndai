import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { broadcastToSession } from "@/lib/socket/server";
import { JoinSessionError, joinSession } from "@/server/services/session-service";

const JoinBodySchema = z.object({
  joinCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = JoinBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }
    const userId = user.id;
    const { sessionId, playerId } = await joinSession({
      joinCode: parsed.data.joinCode,
      userId,
    });
    try {
      await broadcastToSession(sessionId, "player-joined", {
        player_id: playerId,
        name: "",
        character_class: "",
      });
    } catch (err) {
      console.error(err);
    }
    return NextResponse.json({ sessionId, playerId });
  } catch (e) {
    if (e instanceof JoinSessionError) {
      return apiError(e.message, e.statusCode);
    }
    return handleApiError(e);
  }
}
