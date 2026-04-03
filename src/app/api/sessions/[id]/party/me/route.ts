import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { getPartyMePayloadForUser } from "@/server/services/party-secret-service";

/**
 * Per-player party surface: secret role + objectives + secret BP (never other players’ assignments).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }
    if (!(await isSessionMember(sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    const [srow] = await db
      .select({ game_kind: sessions.game_kind })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!srow) return apiError("Not found", 404);
    if (srow.game_kind !== "party") {
      return apiError("Not a party session", 409);
    }

    const payload = await getPartyMePayloadForUser({
      sessionId,
      userId: user.id,
    });
    if (!payload) {
      return apiError("Not found", 404);
    }

    return NextResponse.json(payload);
  } catch (e) {
    return handleApiError(e);
  }
}
