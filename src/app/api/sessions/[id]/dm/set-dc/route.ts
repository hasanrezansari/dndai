import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { redis } from "@/lib/redis";
import { broadcastToSession } from "@/lib/socket/server";
import { assertHumanSessionDm, DmAuthError } from "@/server/services/dm-auth";

const BodySchema = z.object({
  playerId: z.string().uuid(),
  dc: z.number().int().min(5).max(30),
});

function dcRedisKey(sessionId: string): string {
  return `session:dc:${sessionId}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
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

    try {
      await assertHumanSessionDm(
        sessionId,
        parsed.data.playerId,
        user.id,
      );
    } catch (e) {
      if (e instanceof DmAuthError) {
        return apiError(e.message, 403);
      }
      throw e;
    }

    if (redis) {
      await redis.set(dcRedisKey(sessionId), String(parsed.data.dc), {
        ex: 300,
      });
    }

    try {
      await broadcastToSession(sessionId, "dm-notice", {
        message: `DM set DC to ${parsed.data.dc}`,
      });
    } catch (err) {
      console.error(err);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
