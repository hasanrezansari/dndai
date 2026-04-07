import { randomUUID } from "crypto";

import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { COPY } from "@/lib/copy/ashveil";
import {
  isPlayerForUser,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { actions, sessions, turns } from "@/lib/db/schema";
import { runImagePipeline } from "@/lib/orchestrator/image-worker";
import { resumeTurnPipelineAfterPvpDefense } from "@/lib/orchestrator/pipeline";
import { broadcastToSession } from "@/lib/socket/server";
import { finalizeSessionEnd } from "@/server/services/quest-service";
import {
  assertCampaignChapterAllowsAiTurn,
  assertChapterImageBudget,
  incrementChapterSystemImageUsage,
} from "@/server/services/chapter-runtime-service";
import { loadPvpDefenseStage } from "@/server/services/pvp-defense-service";
import {
  acquireTurnLock,
  advanceTurn,
  NotYourTurnError,
  PartySessionRpgActionError,
  releaseTurnLock,
  resolveAwaitingDmTurn,
  resolveCurrentProcessingTurn,
  TurnBeingProcessedError,
} from "@/server/services/turn-service";

export const maxDuration = 120;

const BodySchema = z.object({
  playerId: z.string().uuid(),
  turnId: z.string().uuid(),
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

  const chapterGate = await assertCampaignChapterAllowsAiTurn({ sessionId });
  if (!chapterGate.ok) {
    return NextResponse.json(
      { error: chapterGate.error, code: chapterGate.code },
      { status: chapterGate.status },
    );
  }

  let lockHeld = false;

  try {
    const [sessionRow] = await db
      .select({ game_kind: sessions.game_kind })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (sessionRow?.game_kind === "party") {
      throw new PartySessionRpgActionError();
    }

    const stage = await loadPvpDefenseStage(parsed.data.turnId);
    if (!stage || stage.defenderPlayerId !== parsed.data.playerId) {
      return apiError("No PvP defense pending for this player", 409);
    }

    const locked = await acquireTurnLock(sessionId);
    if (!locked) {
      throw new TurnBeingProcessedError();
    }
    lockHeld = true;

    const [markedProcessing] = await db
      .update(turns)
      .set({ status: "processing" })
      .where(
        and(
          eq(turns.id, parsed.data.turnId),
          eq(turns.status, "awaiting_pvp_defense"),
        ),
      )
      .returning({ id: turns.id });

    if (!markedProcessing) {
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return apiError("No PvP defense window open for this turn", 409);
    }

    const [defenseAction] = await db
      .insert(actions)
      .values({
        turn_id: parsed.data.turnId,
        raw_input: parsed.data.text,
        resolution_status: "pending",
      })
      .returning({ id: actions.id });

    if (!defenseAction) {
      await releaseTurnLock(sessionId);
      lockHeld = false;
      throw new Error("Failed to record defense action");
    }

    const [completedTurnRow] = await db
      .select({ round_number: turns.round_number })
      .from(turns)
      .where(eq(turns.id, parsed.data.turnId))
      .limit(1);
    const completedTurnRound = completedTurnRow?.round_number ?? 1;

    try {
      await broadcastToSession(sessionId, "action-submitted", {
        player_id: parsed.data.playerId,
        raw_input: parsed.data.text,
        turn_id: parsed.data.turnId,
        round_number: completedTurnRound,
      });
    } catch (err) {
      console.error(err);
    }

    const pipelineResult = await resumeTurnPipelineAfterPvpDefense({
      sessionId,
      turnId: parsed.data.turnId,
      defenderPlayerId: parsed.data.playerId,
      defenseActionId: defenseAction.id,
      defenseRawInput: parsed.data.text,
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
          turn_id: parsed.data.turnId,
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
            turn_id: parsed.data.turnId,
            round_number: completedTurnRound,
          });
        } catch (err) {
          console.error(err);
        }
        try {
          await broadcastToSession(sessionId, "state-update", {
            changes: pipelineResult.statePatches,
            state_version: stateVersion,
            turn_id: parsed.data.turnId,
            round_number: completedTurnRound,
          });
        } catch (err) {
          console.error(err);
        }
        if (pipelineResult.consequenceEffects.length > 0) {
          try {
            await broadcastToSession(sessionId, "stat-change", {
              effects: pipelineResult.consequenceEffects,
              turn_id: parsed.data.turnId,
              round_number: completedTurnRound,
            });
          } catch (err) {
            console.error("[pvp-defense] stat-change broadcast failed:", err);
          }
        }
        await releaseTurnLock(sessionId);
        lockHeld = false;
        return NextResponse.json(
          { actionId: defenseAction.id, turnId: parsed.data.turnId },
          { status: 202 },
        );
      }

      const [sessionRow2] = await db
        .select({ state_version: sessions.state_version })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: sessionRow2?.state_version ?? 0,
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      if (pipelineResult.consequenceEffects.length > 0) {
        try {
          await broadcastToSession(sessionId, "stat-change", {
            effects: pipelineResult.consequenceEffects,
            turn_id: parsed.data.turnId,
            round_number: completedTurnRound,
          });
        } catch (err) {
          console.error("[pvp-defense] stat-change broadcast failed:", err);
        }
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json(
        { actionId: defenseAction.id, turnId: parsed.data.turnId },
        { status: 202 },
      );
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
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      try {
        await broadcastToSession(sessionId, "dm-notice", {
          message: "The campaign reaches its conclusion.",
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: stateVersion,
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json(
        { actionId: defenseAction.id, turnId: parsed.data.turnId },
        { status: 202 },
      );
    }

    const expectedNextPlayerId = pipelineResult.narrativeEvent.next_actor_id;

    try {
      await broadcastToSession(sessionId, "narration-update", {
        scene_text: pipelineResult.narrativeEvent.scene_text,
        visible_changes: pipelineResult.narrativeEvent.visible_changes,
        next_actor: {
          player_id: expectedNextPlayerId ?? parsed.data.playerId,
        },
        turn_id: parsed.data.turnId,
        round_number: completedTurnRound,
      });
    } catch (err) {
      console.error(err);
    }

    if (pipelineResult.consequenceEffects.length > 0) {
      try {
        await broadcastToSession(sessionId, "stat-change", {
          effects: pipelineResult.consequenceEffects,
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error("[pvp-defense] stat-change broadcast failed:", err);
      }
    }

    const advanceResult = await advanceTurn(sessionId);
    if (advanceResult.partyWipe) {
      const stateVersion = await finalizeSessionEnd(sessionId);
      try {
        await broadcastToSession(sessionId, "dm-notice", {
          message: "The party has fallen. The adventure ends here.",
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: pipelineResult.statePatches,
          state_version: stateVersion,
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      await releaseTurnLock(sessionId);
      lockHeld = false;
      return NextResponse.json(
        { actionId: defenseAction.id, turnId: parsed.data.turnId },
        { status: 202 },
      );
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
        turn_id: parsed.data.turnId,
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
          turn_id: parsed.data.turnId,
          round_number: completedTurnRound,
        });
      } catch (err) {
        console.error(err);
      }
      const imgPayload = pipelineResult.imageJobPayload;
      after(async () => {
        try {
          const budget = await assertChapterImageBudget({ sessionId });
          if (!budget.ok) {
            await broadcastToSession(sessionId, "scene-image-failed", {
              scene_id: sceneImageId,
            });
            return;
          }
          const result = await runImagePipeline({
            sessionId,
            turnId: imgPayload.turnId,
            narrativeText: imgPayload.narrativeText,
            sceneContext: imgPayload.sceneContext,
            characterNames: imgPayload.characterNames,
            imageHint: imgPayload.imageHint,
          });
          if (result.imageUrl) {
            await incrementChapterSystemImageUsage(sessionId);
            await broadcastToSession(sessionId, "scene-image-ready", {
              scene_id: sceneImageId,
              image_url: result.imageUrl,
            });
          } else {
            await broadcastToSession(sessionId, "scene-image-failed", {
              scene_id: sceneImageId,
            });
          }
        } catch (err) {
          console.error("[pvp-defense] action image failed:", err);
          try {
            await broadcastToSession(sessionId, "scene-image-failed", {
              scene_id: sceneImageId,
            });
          } catch {
            /* no-op */
          }
        }
      });
    }

    await releaseTurnLock(sessionId);
    lockHeld = false;

    return NextResponse.json(
      { actionId: defenseAction.id, turnId: parsed.data.turnId },
      { status: 202 },
    );
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
    if (e instanceof PartySessionRpgActionError) {
      return apiError(e.message, 409);
    }
    return handleApiError(e);
  }
}
