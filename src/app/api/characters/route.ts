import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { isCustomClassesEnabled } from "@/lib/config/features";
import { CharacterStatsSchema, ClassProfileSchema } from "@/lib/schemas/domain";
import { CLASSES, normalizeCharacterRace } from "@/lib/rules/character";
import { broadcastToSession } from "@/lib/socket/server";
import {
  CharacterAlreadyExistsError,
  createCharacter,
  PlayerNotFoundForCharacterError,
} from "@/server/services/character-service";

const classSet = new Set<string>(CLASSES.map((c) => c.value));
const CreateBodySchema = z.object({
  playerId: z.string().uuid(),
  sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(48),
  characterClass: z.string().trim().min(1).max(40),
  race: z.string().max(160),
  stats: CharacterStatsSchema,
  pronouns: z.string().max(20).optional(),
  traits: z.array(z.string().max(40)).max(5).optional(),
  backstory: z.string().max(500).optional(),
  appearance: z.string().max(220).optional(),
  classProfile: ClassProfileSchema.optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const json: unknown = await request.json();
    const parsed = CreateBodySchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid body";
      return apiError(message, 400);
    }
    const {
      playerId,
      sessionId,
      name,
      characterClass,
      race,
      stats,
      pronouns,
      traits,
      backstory,
      appearance,
      classProfile,
    } =
      parsed.data;
    if (!(await isPlayerForUser(playerId, sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }
    const cls = characterClass.trim().toLowerCase();
    const raceNorm = normalizeCharacterRace(race);
    const isPresetClass = classSet.has(cls);
    if (!isPresetClass) {
      if (!isCustomClassesEnabled()) {
        return apiError("Custom classes are currently disabled", 403);
      }
      if (!classProfile || classProfile.source !== "custom") {
        return apiError("Invalid class", 400);
      }
    }
    if (!raceNorm.ok) {
      return apiError(raceNorm.error, 400);
    }
    for (const v of Object.values(stats)) {
      if (v < 3 || v > 18) {
        return apiError("Invalid stats", 400);
      }
    }
    const { characterId } = await createCharacter({
      playerId,
      sessionId,
      name,
      characterClass: cls,
      race: raceNorm.value,
      stats,
      pronouns,
      traits,
      backstory,
      appearance,
      classProfile,
    });
    try {
      await broadcastToSession(sessionId, "player-ready", {
        player_id: playerId,
        is_ready: true,
      });
    } catch (err) {
      console.error(err);
    }
    return NextResponse.json({ characterId }, { status: 201 });
  } catch (e) {
    if (e instanceof PlayerNotFoundForCharacterError) {
      return apiError("Not found", 404);
    }
    if (e instanceof CharacterAlreadyExistsError) {
      return apiError("Conflict", 409);
    }
    return handleApiError(e);
  }
}
