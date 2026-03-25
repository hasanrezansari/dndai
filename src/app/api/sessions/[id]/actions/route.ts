import { randomUUID } from "crypto";

import { eq } from "drizzle-orm";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { COPY } from "@/lib/copy/ashveil";

export const maxDuration = 60;
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import {
  runTurnPipeline,
  scheduleSessionImageGeneration,
} from "@/lib/orchestrator/pipeline";
import { broadcastToSession } from "@/lib/socket/server";
import {
  advanceTurn,
  NotYourTurnError,
  releaseTurnLock,
  submitAction,
  TurnBeingProcessedError,
} from "@/server/services/turn-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  text: z.string().min(1).max(8000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await context.params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return apiError("Invalid session id", 400);
  }

  const user = await requireUser();
  if (!user) return unauthorizedResponse();

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError("Invalid body", 400);
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError("Invalid body", 400);
  }

  if (
    !(await isPlayerForUser(parsed.data.playerId, sessionId, user.id))
  ) {
    return apiError("Forbidden", 403);
  }

  let lockHeld = false;

  try {
    const { actionId, turnId } = await submitAction({
      sessionId,
      playerId: parsed.data.playerId,
      rawInput: parsed.data.text,
    });
    lockHeld = true;

    const pipelineResult = await runTurnPipeline({
      sessionId,
      turnId,
      actionId,
      playerId: parsed.data.playerId,
      rawInput: parsed.data.text,
    });

    for (const diceRoll of pipelineResult.diceRolls) {
      try {
        await broadcastToSession(sessionId, "dice-result", {
          dice_type: diceRoll.roll_type,
          roll_value: diceRoll.roll_value,
          modifier: diceRoll.modifier,
          total: diceRoll.total,
          result: diceRoll.result,
          context: diceRoll.context,
        });
      } catch (err) {
        console.error(err);
      }
    }

    if (pipelineResult.kind === "human_dm") {
      const [sessionRow] = await db
        .select({ state_version: sessions.state_version })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: sessionRow?.state_version ?? 0,
        });
      } catch (err) {
        console.error(err);
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json({ actionId, turnId }, { status: 202 });
    }

    const { nextPlayerId } = await advanceTurn(sessionId);

    const [sessionAfterAdvance] = await db
      .select({ state_version: sessions.state_version })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    try {
      await broadcastToSession(sessionId, "narration-update", {
        scene_text: pipelineResult.narrativeEvent.scene_text,
        visible_changes: pipelineResult.narrativeEvent.visible_changes,
        next_actor: { player_id: nextPlayerId },
      });
    } catch (err) {
      console.error(err);
    }

    try {
      await broadcastToSession(sessionId, "state-update", {
        changes: pipelineResult.statePatches,
        state_version: sessionAfterAdvance?.state_version ?? 0,
      });
    } catch (err) {
      console.error(err);
    }

    if (pipelineResult.imageNeeded && pipelineResult.imageJobPayload) {
      const sceneImageId = randomUUID();
      try {
        await broadcastToSession(sessionId, "scene-image-pending", {
          scene_id: sceneImageId,
          label: COPY.scenePending,
        });
      } catch (err) {
        console.error(err);
      }
      const imgPayload = pipelineResult.imageJobPayload;
      after(async () => {
        await scheduleSessionImageGeneration(sessionId, sceneImageId, imgPayload);
      });
    }

    await releaseTurnLock(sessionId);
    lockHeld = false;

    return NextResponse.json({ actionId, turnId }, { status: 202 });
  } catch (e) {
    if (lockHeld) {
      try {
        await releaseTurnLock(sessionId);
      } catch (err) {
        console.error(err);
      }
    }
    if (e instanceof NotYourTurnError) {
      return apiError("Not your turn", 403);
    }
    if (e instanceof TurnBeingProcessedError) {
      return apiError("Turn is being processed", 409);
    }
    return handleApiError(e);
  }
}
