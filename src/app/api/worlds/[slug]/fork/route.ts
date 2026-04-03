import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { SessionModeSchema } from "@/lib/schemas/enums";
import { broadcastToSession } from "@/lib/socket/server";
import { getSession } from "@/server/services/session-service";
import {
  forkWorldToSession,
  WorldSlugParamSchema,
} from "@/server/services/world-service";

const ForkBodySchema = z.object({
  maxPlayers: z.number().int().min(1).max(6).optional(),
  mode: SessionModeSchema.optional(),
});

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * Canonical “Start this world” for gallery analytics.
 * Same JSON shape as `POST /api/sessions` create response.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { slug } = await context.params;
    const slugParsed = WorldSlugParamSchema.safeParse(slug);
    if (!slugParsed.success) {
      return apiError("Not found", 404);
    }

    const json: unknown = await request.json().catch(() => ({}));
    const bodyParsed = ForkBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      return apiError("Invalid body", 400);
    }

    const { sessionId, joinCode } = await forkWorldToSession({
      worldIdOrSlug: slugParsed.data,
      hostUserId: user.id,
      mode: bodyParsed.data.mode,
      maxPlayers: bodyParsed.data.maxPlayers,
      acquisitionSource: "worlds_gallery_fork",
    });

    const session = await getSession(sessionId);
    const host = session.players.find((p) => p.is_host);
    if (host) {
      try {
        await broadcastToSession(sessionId, "player-joined", {
          player_id: host.id,
          name: "",
          character_class: "",
        });
      } catch (err) {
        console.error(err);
      }
    }

    return NextResponse.json(
      {
        sessionId,
        joinCode,
        hostPlayerId: host?.id ?? null,
      },
      { status: 201 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
