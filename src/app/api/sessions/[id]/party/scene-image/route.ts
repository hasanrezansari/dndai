import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { internalBearerAuthorized } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { runImagePipeline } from "@/lib/orchestrator/image-worker";
import { PartyConfigV1Schema } from "@/lib/schemas/party";
import { broadcastPartyStateRefresh } from "@/lib/party/party-socket";

export const maxDuration = 120;

const BodySchema = z.object({
  narrative_text: z.string().min(1).max(8000),
  round_index: z.number().int().min(1).max(99),
});

async function executePartySceneImageJob(params: {
  sessionId: string;
  narrativeText: string;
  roundIndex: number;
}): Promise<void> {
  const { sessionId, narrativeText, roundIndex } = params;
  const sceneContextSuffix = `Party game round ${roundIndex}`;
  try {
    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!row || row.game_kind !== "party") {
      return;
    }

    const cfgParse = PartyConfigV1Schema.safeParse(row.party_config);
    if (!cfgParse.success) return;
    const cfg0 = cfgParse.data;
    if (cfg0.party_phase === "lobby" || cfg0.party_phase === "ended") {
      return;
    }

    const sceneContext = `${sceneContextSuffix}; template: ${cfg0.template_key}`;
    let imageUrl: string | null = null;
    try {
      const result = await runImagePipeline({
        sessionId,
        turnId: null,
        narrativeText,
        sceneContext,
        characterNames: [],
      });
      imageUrl = result.imageUrl;
    } catch (err) {
      console.error("[party/scene-image] pipeline error", err);
    }

    if (!imageUrl?.trim()) {
      console.warn(
        "[party/scene-image] no image URL after pipeline",
        sessionId,
        "round",
        roundIndex,
      );
      return;
    }

    const urlTrim = imageUrl.trim();
    const roundKey = String(roundIndex);

    const [row2] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!row2) return;

    const cfgParse2 = PartyConfigV1Schema.safeParse(row2.party_config);
    if (!cfgParse2.success) {
      return;
    }
    const cfg = cfgParse2.data;

    const byRound = { ...(cfg.scene_image_by_round ?? {}), [roundKey]: urlTrim };
    const appliesToCurrentRound = cfg.round_index === roundIndex;
    const nextConfig = {
      ...cfg,
      scene_image_by_round: byRound,
      ...(appliesToCurrentRound ? { scene_image_url: urlTrim } : {}),
    };

    const [updated] = await db
      .update(sessions)
      .set({
        party_config: nextConfig,
        state_version: row2.state_version + 1,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.state_version, row2.state_version),
        ),
      )
      .returning({ state_version: sessions.state_version });

    if (!updated) {
      return;
    }

    await broadcastPartyStateRefresh(sessionId, updated.state_version);
  } catch (e) {
    console.error("[party/scene-image] after() job failed", sessionId, e);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!internalBearerAuthorized(request)) {
      return apiError("Unauthorized", 401);
    }

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

    const [row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!row) return apiError("Not found", 404);
    if (row.game_kind !== "party") {
      return apiError("Not a party session", 409);
    }

    const cfgParse = PartyConfigV1Schema.safeParse(row.party_config);
    if (!cfgParse.success) {
      return apiError("Invalid party state", 500);
    }
    const cfg0 = cfgParse.data;
    if (cfg0.party_phase === "lobby" || cfg0.party_phase === "ended") {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const narrativeText = parsed.data.narrative_text;
    const roundIndex = parsed.data.round_index;

    after(() =>
      executePartySceneImageJob({
        sessionId,
        narrativeText,
        roundIndex,
      }),
    );

    return NextResponse.json(
      { ok: true, accepted: true, round_index: roundIndex },
      { status: 202 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
