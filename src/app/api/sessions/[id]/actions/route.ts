import { randomUUID } from "crypto";

import { eq } from "drizzle-orm";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

import { apiError, handleApiError } from "@/lib/api/errors";
import { COPY } from "@/lib/copy/ashveil";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions, turns } from "@/lib/db/schema";
import { runTurnPipeline } from "@/lib/orchestrator/pipeline";
import { runImagePipeline } from "@/lib/orchestrator/image-worker";
import { broadcastToSession } from "@/lib/socket/server";
import { finalizeSessionEnd } from "@/server/services/quest-service";
import {
  advanceTurn,
  NotYourTurnError,
  resolveCurrentProcessingTurn,
  resolveAwaitingDmTurn,
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

    const [completedTurnRow] = await db
      .select({ round_number: turns.round_number })
      .from(turns)
      .where(eq(turns.id, turnId))
      .limit(1);
    const completedTurnRound = completedTurnRow?.round_number ?? 1;

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
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
    }

    if (pipelineResult.kind === "human_dm") {
      if (pipelineResult.shouldEndSession) {
        await resolveAwaitingDmTurn(sessionId);
        const stateVersion = await finalizeSessionEnd(sessionId);
        try {
          await broadcastToSession(sessionId, "dm-notice", {
            message: "The campaign reaches its conclusion.",
            turn_id: turnId,
            round_number: completedTurnRound,
          });
        } catch (err) {
          console.error(err);
        }
        try {
          await broadcastToSession(sessionId, "state-update", {
            changes: pipelineResult.statePatches,
            state_version: stateVersion,
            turn_id: turnId,
            round_number: completedTurnRound,
          });
        } catch (err) {
          console.error(err);
        }
        if (pipelineResult.consequenceEffects.length > 0) {
          try {
            await broadcastToSession(sessionId, "stat-change", {
              effects: pipelineResult.consequenceEffects,
              turn_id: turnId,
              round_number: completedTurnRound,
            });
          } catch (err) {
            console.error("[actions] stat-change broadcast failed:", err);
          }
        }
        await releaseTurnLock(sessionId);
        lockHeld = false;
        return NextResponse.json({ actionId, turnId }, { status: 202 });
      }

      const [sessionRow] = await db
        .select({ state_version: sessions.state_version })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: sessionRow?.state_version ?? 0,
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      if (pipelineResult.consequenceEffects.length > 0) {
        try {
          await broadcastToSession(sessionId, "stat-change", {
            effects: pipelineResult.consequenceEffects,
            turn_id: turnId,
            round_number: completedTurnRound,
          });
        } catch (err) {
          console.error("[actions] stat-change broadcast failed:", err);
        }
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json({ actionId, turnId }, { status: 202 });
    }

    const shouldEndSession =
      "shouldEndSession" in pipelineResult && pipelineResult.shouldEndSession;
    if (shouldEndSession) {
      await resolveCurrentProcessingTurn(sessionId);
      const stateVersion = await finalizeSessionEnd(sessionId);
      try {
        await broadcastToSession(sessionId, "narration-update", {
          scene_text: pipelineResult.narrativeEvent.scene_text,
          visible_changes: pipelineResult.narrativeEvent.visible_changes,
          next_actor: { player_id: parsed.data.playerId },
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      try {
        await broadcastToSession(sessionId, "dm-notice", {
          message: "The campaign reaches its conclusion.",
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: stateVersion,
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json({ actionId, turnId }, { status: 202 });
    }

    const expectedNextPlayerId = pipelineResult.narrativeEvent.next_actor_id;

    try {
      await broadcastToSession(sessionId, "narration-update", {
        scene_text: pipelineResult.narrativeEvent.scene_text,
        visible_changes: pipelineResult.narrativeEvent.visible_changes,
        next_actor: { player_id: expectedNextPlayerId ?? parsed.data.playerId },
        turn_id: turnId,
        round_number: completedTurnRound,
      });
    } catch (err) {
      console.error(err);
    }

    if (pipelineResult.consequenceEffects.length > 0) {
      try {
        await broadcastToSession(sessionId, "stat-change", {
          effects: pipelineResult.consequenceEffects,
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error("[actions] stat-change broadcast failed:", err);
      }
    }

    const advanceResult = await advanceTurn(sessionId);
    if (advanceResult.partyWipe) {
      const stateVersion = await finalizeSessionEnd(sessionId);
      try {
        await broadcastToSession(sessionId, "dm-notice", {
          message: "The party has fallen. The adventure ends here.",
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: stateVersion,
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json({ actionId, turnId }, { status: 202 });
    }

    const [sessionAfterAdvance] = await db
      .select({ state_version: sessions.state_version })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    try {
      await broadcastToSession(sessionId, "state-update", {
        changes: pipelineResult.statePatches,
        state_version: sessionAfterAdvance?.state_version ?? 0,
        turn_id: turnId,
        round_number: completedTurnRound,
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
          turn_id: turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      const imgPayload = pipelineResult.imageJobPayload;
      after(async () => {
        try {
          console.log("[image-after] starting image generation for action turn");
          const result = await runImagePipeline({
            sessionId,
            turnId: imgPayload.turnId,
            narrativeText: imgPayload.narrativeText,
            sceneContext: imgPayload.sceneContext,
            characterNames: imgPayload.characterNames,
            imageHint: imgPayload.imageHint,
          });
          console.log("[image-after] pipeline done, imageUrl:", result.imageUrl ?? "null");
          if (result.imageUrl) {
            await broadcastToSession(sessionId, "scene-image-ready", {
              scene_id: sceneImageId,
              image_url: result.imageUrl,
            });
            console.log("[image-after] broadcast scene-image-ready OK");
          } else {
            await broadcastToSession(sessionId, "scene-image-failed", {
              scene_id: sceneImageId,
            });
            console.log("[image-after] broadcast scene-image-failed");
          }
        } catch (err) {
          console.error("[image-after] action image failed:", err);
          try {
            await broadcastToSession(sessionId, "scene-image-failed", {
              scene_id: sceneImageId,
            });
          } catch { /* best effort */ }
        }
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
