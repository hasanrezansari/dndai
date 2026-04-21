import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Party start awaits AI round opener (up to ~45s) + secrets; keep headroom vs default 60s. */
export const maxDuration = 120;

import { apiError, handleApiError, insufficientSparksResponse } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { isPlayRomanaModuleKey } from "@/lib/ai/narrative-session-profile";
import { db } from "@/lib/db";
import { players, sessions } from "@/lib/db/schema";
import { broadcastPartyStateRefresh } from "@/lib/party/party-socket";
import { broadcastToSession } from "@/lib/socket/server";
import { createPlayRomanaQuickCharacter } from "@/server/services/character-service";
import {
  allSessionPlayersHaveCharacterIds,
  runCampaignOpeningPipeline,
} from "@/server/services/campaign-lobby-bootstrap-service";
import {
  canStartSession,
  SessionNotFoundError,
  startSession,
} from "@/server/services/session-service";
import { activatePartySessionFromLobby } from "@/server/services/party-phase-service";
import { SPARK_COST_CAMPAIGN_SESSION_START } from "@/lib/spark-pricing";
import {
  InsufficientSparksError,
  isMonetizationSpendEnabled,
  tryDebitSparksWithSessionPool,
  tryRefundSessionSparkDebit,
} from "@/server/services/spark-economy-service";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  /** Solo PlayRomana module: create a preset hero and skip character builder. */
  quickPlay: z.boolean().optional(),
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
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }

    const [hostPlayer] = await db
      .select()
      .from(players)
      .where(
        and(
          eq(players.id, parsed.data.playerId),
          eq(players.session_id, sessionId),
        ),
      )
      .limit(1);

    if (!hostPlayer?.is_host || hostPlayer.user_id !== user.id) {
      return apiError("Forbidden", 403);
    }

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRow) {
      return apiError("Not found", 404);
    }

    if (sessionRow.status !== "lobby") {
      return apiError("Session already started", 409);
    }

    if (parsed.data.quickPlay) {
      if (sessionRow.game_kind !== "campaign") {
        return apiError("Quick play is only for campaign sessions", 400);
      }
      if (
        sessionRow.campaign_mode !== "module" ||
        !sessionRow.module_key ||
        !isPlayRomanaModuleKey(sessionRow.module_key)
      ) {
        return apiError("Quick play is only for PlayRomana story modules", 400);
      }
      if (sessionRow.max_players !== 1) {
        return apiError("Quick play requires a solo table", 400);
      }
      const lobbyPlayers = await db
        .select({ id: players.id, character_id: players.character_id })
        .from(players)
        .where(eq(players.session_id, sessionId));
      if (lobbyPlayers.length !== 1) {
        return apiError(
          "Quick play requires exactly one player in the lobby",
          400,
        );
      }
      const sole = lobbyPlayers[0]!;
      if (sole.id !== hostPlayer.id) {
        return apiError("Forbidden", 403);
      }
      if (!sole.character_id) {
        await createPlayRomanaQuickCharacter({
          playerId: hostPlayer.id,
          sessionId,
        });
      }
    }

    if (!(await canStartSession(sessionId))) {
      return apiError("Not all players are ready", 409);
    }

    let sessionStartDebited = false;
    let sessionStartPoolUsed = 0;
    if (
      sessionRow.game_kind !== "party" &&
      sessionRow.mode === "ai_dm" &&
      isMonetizationSpendEnabled()
    ) {
      try {
        const r = await tryDebitSparksWithSessionPool({
          payerUserId: sessionRow.host_user_id,
          amount: SPARK_COST_CAMPAIGN_SESSION_START,
          idempotencyKey: `campaign_session_start:${sessionId}`,
          sessionId,
          reason: "campaign_session_start",
        });
        sessionStartDebited = r.applied;
        sessionStartPoolUsed = r.fromPool;
      } catch (sparkErr) {
        if (sparkErr instanceof InsufficientSparksError) {
          return insufficientSparksResponse({
            balance: sparkErr.balance,
            required: sparkErr.required,
          });
        }
        throw sparkErr;
      }
    }

    const started = await startSession(sessionId);
    if (!started) {
      if (sessionStartDebited && isMonetizationSpendEnabled()) {
        try {
          await tryRefundSessionSparkDebit({
            hostUserId: sessionRow.host_user_id,
            sessionId,
            totalAmount: SPARK_COST_CAMPAIGN_SESSION_START,
            idempotencyKey: `refund:campaign_session_start:${sessionId}`,
            reason: "refund_session_start_failed",
            sparkPoolUsed: sessionStartPoolUsed,
          });
        } catch (refundErr) {
          console.error("[sparks] refund after start failure", refundErr);
        }
      }
      return apiError("Could not start session", 409);
    }

    async function rollbackActiveSessionToLobby(): Promise<void> {
      await db
        .update(sessions)
        .set({
          status: "lobby",
          current_player_id: null,
          current_turn_index: 0,
          state_version: sql`${sessions.state_version} + 1`,
          updated_at: new Date(),
        })
        .where(eq(sessions.id, sessionId));
    }

    if (sessionRow.game_kind === "party") {
      await activatePartySessionFromLobby(sessionId);
      try {
        const [fresh] = await db
          .select({ state_version: sessions.state_version })
          .from(sessions)
          .where(eq(sessions.id, sessionId))
          .limit(1);
        const v = fresh?.state_version ?? 0;
        await broadcastPartyStateRefresh(sessionId, v);
        await broadcastToSession(sessionId, "session-started", {
          campaign_title: "Party room",
          opening_scene: "Submit your lines for round 1.",
          game_kind: "party",
        });
      } catch (err) {
        console.error(err);
      }
      return NextResponse.json(
        { ok: true, partyMode: true, sessionId },
        { status: 200 },
      );
    }

    const campaignAwaitingHeroes =
      sessionRow.game_kind === "campaign" &&
      !parsed.data.quickPlay &&
      !(await allSessionPlayersHaveCharacterIds(sessionId));

    if (campaignAwaitingHeroes) {
      try {
        await broadcastToSession(sessionId, "session-started", {
          campaign_title: "Prepare your heroes",
          opening_scene:
            "The host has opened the table. Finish your hero (or pick a saved profile) so the story can begin.",
          game_kind: "campaign",
        });
      } catch (err) {
        console.error(err);
      }
      return NextResponse.json(
        { ok: true, awaitingHeroes: true, sessionId },
        { status: 200 },
      );
    }

    try {
      await runCampaignOpeningPipeline(sessionId, {
        quickPlay: Boolean(parsed.data.quickPlay),
      });
    } catch (err) {
      await rollbackActiveSessionToLobby();
      if (sessionStartDebited && isMonetizationSpendEnabled()) {
        try {
          await tryRefundSessionSparkDebit({
            hostUserId: sessionRow.host_user_id,
            sessionId,
            totalAmount: SPARK_COST_CAMPAIGN_SESSION_START,
            idempotencyKey: `refund:campaign_session_start_pipeline:${sessionId}`,
            reason: "refund_campaign_opening_failed",
            sparkPoolUsed: sessionStartPoolUsed,
          });
        } catch (refundErr) {
          console.error("[sparks] refund after campaign opening failure", refundErr);
        }
      }
      console.error("[start] campaign opening pipeline failed:", err);
      const msg =
        err instanceof Error ? err.message : "Could not open the campaign";
      return apiError(msg, 500);
    }

    return NextResponse.json({
      ok: true,
      quickPlay: Boolean(parsed.data.quickPlay),
    });
  } catch (e) {
    if (e instanceof SessionNotFoundError) {
      return apiError("Not found", 404);
    }
    return handleApiError(e);
  }
}
