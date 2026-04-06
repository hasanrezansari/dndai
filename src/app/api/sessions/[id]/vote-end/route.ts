import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { broadcastToSession } from "@/lib/socket/server";
import { rollChapterWindowAfterVoteCooldown } from "@/server/services/chapter-runtime-service";
import {
  castEndingVote,
  finalizeSessionEnd,
  QUEST_ENDING_VOTE_COOLDOWN_MESSAGE,
} from "@/server/services/quest-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  choice: z.enum(["end_now", "continue"]),
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

    if (
      !(await isPlayerForUser(parsed.data.playerId, sessionId, user.id))
    ) {
      return apiError("Forbidden", 403);
    }

    const [sessionRow] = await db
      .select({
        mode: sessions.mode,
        status: sessions.status,
        currentRound: sessions.current_round,
        game_kind: sessions.game_kind,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRow) return apiError("Not found", 404);
    if (sessionRow.game_kind === "party") {
      return apiError("Campaign vote does not apply to party mode", 409);
    }
    if (sessionRow.status !== "active") {
      return apiError("Session is not active", 409);
    }

    const vote = await castEndingVote({
      sessionId,
      round: sessionRow.currentRound,
      playerId: parsed.data.playerId,
      choice: parsed.data.choice,
    });

    let stateVersion: number;
    if (vote.shouldEndSession) {
      stateVersion = await finalizeSessionEnd(sessionId);
      try {
        await broadcastToSession(sessionId, "dm-notice", {
          message: "The campaign concludes. The final chapter is written.",
        });
      } catch (err) {
        console.error(err);
      }
    } else {
      if (vote.message === QUEST_ENDING_VOTE_COOLDOWN_MESSAGE) {
        stateVersion = await rollChapterWindowAfterVoteCooldown(sessionId);
      } else {
        const [fresh] = await db
          .select({ stateVersion: sessions.state_version })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);
        stateVersion = fresh?.stateVersion ?? 0;
      }
      try {
        await broadcastToSession(sessionId, "dm-notice", {
          message: vote.message,
        });
      } catch (err) {
        console.error(err);
      }
    }

    try {
      await broadcastToSession(sessionId, "state-update", {
        changes: [],
        state_version: stateVersion,
      });
    } catch (err) {
      console.error(err);
    }

    return NextResponse.json({
      ok: true,
      message: vote.message,
      shouldEndSession: vote.shouldEndSession,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

