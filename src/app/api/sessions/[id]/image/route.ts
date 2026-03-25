import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 60;

import { apiError, handleApiError } from "@/lib/api/errors";
import { internalBearerAuthorized } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { runImagePipeline } from "@/lib/orchestrator/image-worker";
import { broadcastToSession } from "@/lib/socket/server";

const BodySchema = z.object({
  turnId: z.string().uuid(),
  narrativeText: z.string(),
  sceneContext: z.string(),
  characterNames: z.array(z.string()),
  scene_id: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    const internalOk = internalBearerAuthorized(request);
    if (!internalOk) {
      const user = await getCurrentUser();
      if (!user) {
        return apiError("Unauthorized", 401);
      }
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

    const { turnId, narrativeText, sceneContext, characterNames, scene_id } =
      parsed.data;

    const [sessionRow] = await db
      .select({ state_version: sessions.state_version })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    const stateVersion = sessionRow?.state_version ?? 0;

    let imageUrl: string | null = null;
    try {
      const result = await runImagePipeline({
        sessionId,
        turnId,
        narrativeText,
        sceneContext,
        characterNames,
      });
      imageUrl = result.imageUrl;
    } catch (err) {
      console.error(err);
    }

    if (imageUrl) {
      try {
        await broadcastToSession(sessionId, "scene-image-ready", {
          scene_id,
          image_url: imageUrl,
        });
      } catch (err) {
        console.error(err);
      }
    } else {
      try {
        await broadcastToSession(sessionId, "state-update", {
          changes: [],
          state_version: stateVersion,
          dismiss_scene_pending: true,
        });
      } catch (err) {
        console.error(err);
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
