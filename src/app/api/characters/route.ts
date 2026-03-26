import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import { CLASSES, RACES } from "@/lib/rules/character";
import { broadcastToSession } from "@/lib/socket/server";
import {
  CharacterAlreadyExistsError,
  createCharacter,
  PlayerNotFoundForCharacterError,
} from "@/server/services/character-service";

const classSet = new Set<string>(CLASSES.map((c) => c.value));
const raceSet = new Set<string>(RACES.map((r) => r.value));

const CreateBodySchema = z.object({
  playerId: z.string().uuid(),
  sessionId: z.string().uuid(),
  name: z.string().trim().min(1).max(48),
  characterClass: z.string(),
  race: z.string(),
  stats: CharacterStatsSchema,
  pronouns: z.string().max(20).optional(),
  traits: z.array(z.string().max(40)).max(5).optional(),
  backstory: z.string().max(500).optional(),
  appearance: z.string().max(220).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const json: unknown = await request.json();
    const parsed = CreateBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }
    const { playerId, sessionId, name, characterClass, race, stats, pronouns, traits, backstory, appearance } =
      parsed.data;
    if (!(await isPlayerForUser(playerId, sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }
    const cls = characterClass.trim().toLowerCase();
    const rc = race.trim().toLowerCase();
    if (!classSet.has(cls)) {
      return apiError("Invalid class", 400);
    }
    if (!raceSet.has(rc)) {
      return apiError("Invalid race", 400);
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
      race: rc,
      stats,
      pronouns,
      traits,
      backstory,
      appearance,
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
