import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { broadcastToSession } from "@/lib/socket/server";
import {
  CampaignModeSchema,
  GameKindSchema,
  SessionModeSchema,
} from "@/lib/schemas/enums";
import { createSession, getSession } from "@/server/services/session-service";
import { forkWorldToSession, WorldSlugParamSchema } from "@/server/services/world-service";

/**
 * When `worldSlug` is set, catalog row wins for premise/module/tags/bible/art;
 * host may still set `mode`, `maxPlayers`, and `acquisitionSource`.
 * Canonical gallery path: `POST /api/worlds/[slug]/fork` (clearer analytics).
 */
const CreateSessionBodySchema = z
  .object({
    mode: SessionModeSchema,
    campaignMode: CampaignModeSchema,
    maxPlayers: z.number().int().min(1).max(6),
    adventurePrompt: z.string().max(8000).optional(),
    adventureTags: z.array(z.string().max(64)).max(24).optional(),
    artDirection: z.string().max(2000).optional(),
    worldBible: z.string().max(32000).optional(),
    moduleKey: z.string().optional(),
    gameKind: GameKindSchema.optional(),
    templateKey: z.string().min(1).max(128).optional(),
    partyTotalRounds: z.number().int().min(1).max(24).optional(),
    partyInstigatorEnabled: z.boolean().optional(),
    /** Analytics: host funnel (e.g. play_romana_party_home). Does not affect gameplay. */
    acquisitionSource: z.string().max(64).optional(),
    worldSlug: WorldSlugParamSchema.optional(),
  })
  .refine((d) => !d.worldSlug || d.gameKind !== "party", {
    message: "worldSlug only applies to campaign sessions",
    path: ["worldSlug"],
  });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const json: unknown = await request.json();
    const parsed = CreateSessionBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }
    const hostUserId = user.id;
    const d = parsed.data;

    const { sessionId, joinCode } = d.worldSlug
      ? await forkWorldToSession({
          worldIdOrSlug: d.worldSlug,
          hostUserId,
          mode: d.mode,
          maxPlayers: d.maxPlayers,
          acquisitionSource:
            d.acquisitionSource ?? "sessions_api_world_slug",
        })
      : await createSession({
          mode: d.mode,
          campaignMode: d.campaignMode,
          maxPlayers: d.maxPlayers,
          hostUserId,
          adventurePrompt: d.adventurePrompt,
          adventureTags: d.adventureTags,
          artDirection: d.artDirection,
          worldBible: d.worldBible,
          moduleKey: d.moduleKey,
          gameKind: d.gameKind,
          templateKey: d.templateKey,
          partyTotalRounds: d.partyTotalRounds,
          partyInstigatorEnabled: d.partyInstigatorEnabled,
          acquisitionSource: d.acquisitionSource,
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
        /** Host row id — avoids an extra GET before ready/start (e.g. PlayRomana inline quick play). */
        hostPlayerId: host?.id ?? null,
      },
      { status: 201 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
