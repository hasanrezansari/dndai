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
  SessionLobbyUpdateError,
  SessionNotFoundError,
  updateSessionLobbyPremise,
} from "@/server/services/session-service";

const PatchSessionBodySchema = z
  .object({
    max_players: z.number().int().min(1).max(6).optional(),
    adventure_prompt: z.string().max(8000).nullable().optional(),
    world_bible: z.string().max(32000).nullable().optional(),
    art_direction: z.string().max(2000).nullable().optional(),
    adventure_tags: z.array(z.string().max(64)).max(24).optional(),
  })
  .refine(
    (d) =>
      d.max_players !== undefined ||
      d.adventure_prompt !== undefined ||
      d.world_bible !== undefined ||
      d.art_direction !== undefined ||
      d.adventure_tags !== undefined,
    { message: "At least one field required" },
  );

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
    const data = parsed.data;

    if (
      data.adventure_prompt !== undefined ||
      data.world_bible !== undefined ||
      data.art_direction !== undefined ||
      data.adventure_tags !== undefined
    ) {
      await updateSessionLobbyPremise({
        sessionId: id,
        actingUserId: user.id,
        adventure_prompt: data.adventure_prompt,
        world_bible: data.world_bible,
        art_direction: data.art_direction,
        adventure_tags: data.adventure_tags,
      });
      try {
        await broadcastToSession(id, "session-premise-updated", {});
      } catch (err) {
        console.error(err);
      }
    }

    if (data.max_players !== undefined) {
      await increaseSessionMaxPlayers({
        sessionId: id,
        actingUserId: user.id,
        newMaxPlayers: data.max_players,
      });
      try {
        const sessionAfterCap = await getSession(id);
        await broadcastToSession(id, "session-cap-updated", {
          max_players: sessionAfterCap.max_players,
        });
      } catch (err) {
        console.error(err);
      }
    }

    const session = await getSession(id);
    return NextResponse.json(session);
  } catch (e) {
    if (e instanceof SessionNotFoundError) {
      return apiError("Not found", 404);
    }
    if (e instanceof IncreaseMaxPlayersError) {
      return apiError(e.message, e.statusCode);
    }
    if (e instanceof SessionLobbyUpdateError) {
      return apiError(e.message, e.statusCode);
    }
    return handleApiError(e);
  }
}
