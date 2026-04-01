import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { narrativeEvents, sessions } from "@/lib/db/schema";
import { initializeQuestState } from "@/server/services/quest-service";
import { createSession, startSession } from "@/server/services/session-service";
import { createFirstTurn } from "@/server/services/turn-service";

const BodySchema = z.object({
  // Default true: send user to character creation after creating session.
  // Allows future "speed tutorial" variants.
  goToCharacter: z.boolean().optional(),
});

const TUTORIAL_MODULE_KEY = "tutorial_v1";

const TUTORIAL_OPENING =
  "Welcome, adventurer.\n\nThis is a short guided run to teach the rhythm of Falvos: you speak an intent, the world responds, dice decide risk, and the story advances.\n\nOn your next turn, try something simple like: “I search the altar for clues.”";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      // allow empty body
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    const { sessionId } = await createSession({
      mode: "ai_dm",
      campaignMode: "module",
      maxPlayers: 1,
      hostUserId: user.id,
      moduleKey: TUTORIAL_MODULE_KEY,
      adventurePrompt: "Tutorial run: teach the core loop in 3 turns.",
    });

    await db
      .update(sessions)
      .set({
        campaign_title: "Tutorial: First Steps",
        updated_at: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    // Activate immediately (tutorial is single-player; skip readiness gating).
    await startSession(sessionId);
    const firstTurnId = await createFirstTurn(sessionId);

    await initializeQuestState({
      sessionId,
      objective: "Complete the tutorial and start your first real adventure.",
      subObjectives: [
        "Take your first action",
        "Trigger a dice check",
        "Make one bold choice",
      ],
      round: 1,
    });

    await db.insert(narrativeEvents).values({
      session_id: sessionId,
      turn_id: firstTurnId,
      scene_text: TUTORIAL_OPENING,
      visible_changes: [],
      tone: "opening",
      next_actor_id: null,
      image_hint: {},
    });

    const goToCharacter = parsed.data.goToCharacter ?? true;
    return NextResponse.json({ sessionId, goToCharacter });
  } catch (e) {
    return handleApiError(e);
  }
}

