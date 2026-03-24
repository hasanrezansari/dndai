import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { broadcastToSession } from "@/lib/socket/server";
import { CampaignModeSchema, SessionModeSchema } from "@/lib/schemas/enums";
import { createSession, getSession } from "@/server/services/session-service";

const CreateSessionBodySchema = z.object({
  mode: SessionModeSchema,
  campaignMode: CampaignModeSchema,
  maxPlayers: z.number().int().min(2).max(6),
  adventurePrompt: z.string().optional(),
  moduleKey: z.string().optional(),
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
    const { sessionId, joinCode } = await createSession({
      mode: parsed.data.mode,
      campaignMode: parsed.data.campaignMode,
      maxPlayers: parsed.data.maxPlayers,
      hostUserId,
      adventurePrompt: parsed.data.adventurePrompt,
      moduleKey: parsed.data.moduleKey,
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
    return NextResponse.json({ sessionId, joinCode }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
