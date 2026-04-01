import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import { instantiateProfileHeroIntoSession } from "@/server/services/profile-hero-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  heroId: z.string().uuid(),
  statsOverride: CharacterStatsSchema.nullable().optional(),
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

    if (!(await isPlayerForUser(parsed.data.playerId, sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    const { characterId } = await instantiateProfileHeroIntoSession({
      userId: user.id,
      heroId: parsed.data.heroId,
      sessionId,
      playerId: parsed.data.playerId,
      statsOverride: parsed.data.statsOverride ?? null,
    });

    return NextResponse.json({ characterId }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

