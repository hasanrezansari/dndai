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
import { broadcastPartyStateRefresh } from "@/lib/party/party-socket";
import { PartyConfigV1Schema } from "@/lib/schemas/party";
import {
  tryPartyMergeWhenReady,
  tryPartyTiebreakSubmitAdvance,
} from "@/server/services/party-phase-service";
import { evaluatePartySecretObjectivesOnSubmit } from "@/server/services/party-secret-service";

export const maxDuration = 120;

const BodySchema = z.object({
  playerId: z.string().uuid(),
  text: z.string().min(1).max(2000),
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

    await tryPartyMergeWhenReady(sessionId);
    await tryPartyTiebreakSubmitAdvance(sessionId);

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!row) return apiError("Not found", 404);
    if (row.game_kind !== "party") {
      return apiError("Not a party session", 409);
    }
    if (row.status !== "active") {
      return apiError("Session is not active", 409);
    }

    const configParse = PartyConfigV1Schema.safeParse(row.party_config);
    if (!configParse.success) {
      return apiError("Invalid party state", 500);
    }
    const cfg = configParse.data;
    const phase = cfg.party_phase;
    if (phase !== "submit" && phase !== "tiebreak_submit") {
      return apiError("Not in submission phase", 409);
    }

    const submittedAt = new Date().toISOString();
    const nextConfig =
      phase === "tiebreak_submit"
        ? (() => {
            const contenders = new Set(cfg.tiebreak_contender_ids ?? []);
            if (!contenders.has(parsed.data.playerId)) {
              return null;
            }
            return {
              ...cfg,
              tiebreak_submissions: {
                ...(cfg.tiebreak_submissions ?? {}),
                [parsed.data.playerId]: {
                  text: parsed.data.text.trim(),
                  submitted_at: submittedAt,
                },
              },
            };
          })()
        : {
            ...cfg,
            submissions: {
              ...(cfg.submissions ?? {}),
              [parsed.data.playerId]: {
                text: parsed.data.text.trim(),
                submitted_at: submittedAt,
              },
            },
          };

    if (nextConfig == null) {
      return apiError("Not eligible for tiebreaker submit", 403);
    }

    const [updated] = await db
      .update(sessions)
      .set({
        party_config: nextConfig,
        state_version: row.state_version + 1,
        updated_at: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .returning({ state_version: sessions.state_version });

    if (!updated) {
      return apiError("Could not save submission", 409);
    }

    await broadcastPartyStateRefresh(sessionId, updated.state_version);

    await evaluatePartySecretObjectivesOnSubmit({
      sessionId,
      playerId: parsed.data.playerId,
      lineText: parsed.data.text.trim(),
    });

    if (phase === "submit") {
      void tryPartyMergeWhenReady(sessionId);
    } else {
      void tryPartyTiebreakSubmitAdvance(sessionId);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
