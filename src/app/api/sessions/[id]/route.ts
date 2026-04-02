import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { broadcastToSession } from "@/lib/socket/server";
import {
  getSession,
  IncreaseMaxPlayersError,
  increaseSessionMaxPlayers,
  SessionNotFoundError,
} from "@/server/services/session-service";

const PatchSessionBodySchema = z.object({
  max_players: z.number().int().min(1).max(6),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiError("Invalid session id", 400);
    }
    if (!(await isSessionMember(id, user.id))) {
      return apiError("Forbidden", 403);
    }
    const session = await getSession(id);
    return NextResponse.json(session);
  } catch (e) {
    if (e instanceof SessionNotFoundError) {
      return apiError("Not found", 404);
    }
    return handleApiError(e);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiError("Invalid session id", 400);
    }
    if (!(await isSessionMember(id, user.id))) {
      return apiError("Forbidden", 403);
    }
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = PatchSessionBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }
    await increaseSessionMaxPlayers({
      sessionId: id,
      actingUserId: user.id,
      newMaxPlayers: parsed.data.max_players,
    });
    const session = await getSession(id);
    try {
      await broadcastToSession(id, "session-cap-updated", {
        max_players: session.max_players,
      });
    } catch (err) {
      console.error(err);
    }
    return NextResponse.json(session);
  } catch (e) {
    if (e instanceof SessionNotFoundError) {
      return apiError("Not found", 404);
    }
    if (e instanceof IncreaseMaxPlayersError) {
      return apiError(e.message, e.statusCode);
    }
    return handleApiError(e);
  }
}
