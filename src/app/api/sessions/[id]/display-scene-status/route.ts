import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  getDisplayTokenFromRequest,
  verifyDisplayToken,
} from "@/lib/display-token";
import { loadSessionSceneStatus } from "@/server/services/session-state-payload";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }

    const raw = getDisplayTokenFromRequest(request);
    if (!raw) {
      return apiError("Missing token", 401);
    }

    const verified = await verifyDisplayToken(raw);
    if (!verified || verified.sessionId !== sessionId) {
      return apiError("Forbidden", 403);
    }

    const payload = await loadSessionSceneStatus(sessionId);
    if (!payload) {
      return apiError("Not found", 404);
    }

    return NextResponse.json(payload);
  } catch (e) {
    return handleApiError(e);
  }
}
