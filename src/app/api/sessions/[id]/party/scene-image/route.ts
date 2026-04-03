import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
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
    const phaseOk =
      cfg0.party_phase === "vote" ||
      cfg0.party_phase === "forgery_guess" ||
      cfg0.party_phase === "submit";
    if (cfg0.round_index !== parsed.data.round_index || !phaseOk) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const turnId = randomUUID();
    const sceneContext = `Party game round ${cfg0.round_index}; template: ${cfg0.template_key}`;
    let imageUrl: string | null = null;
    try {
      const result = await runImagePipeline({
        sessionId,
        turnId,
        narrativeText: parsed.data.narrative_text,
        sceneContext,
        characterNames: [],
      });
      imageUrl = result.imageUrl;
    } catch (err) {
      console.error("[party/scene-image] pipeline error", err);
    }

    if (!imageUrl?.trim()) {
      return NextResponse.json({ ok: true, image: false }, { status: 200 });
    }

    const [row2] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!row2) return apiError("Not found", 404);

    const cfgParse2 = PartyConfigV1Schema.safeParse(row2.party_config);
    if (!cfgParse2.success) {
      return apiError("Invalid party state", 500);
    }
    const cfg = cfgParse2.data;
    const phaseOk2 =
      cfg.party_phase === "vote" ||
      cfg.party_phase === "forgery_guess" ||
      cfg.party_phase === "submit";
    if (cfg.round_index !== parsed.data.round_index || !phaseOk2) {
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    const nextConfig = { ...cfg, scene_image_url: imageUrl.trim() };

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
      return NextResponse.json({ ok: true, skipped: true }, { status: 200 });
    }

    await broadcastPartyStateRefresh(sessionId, updated.state_version);

    return NextResponse.json({ ok: true, image: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
