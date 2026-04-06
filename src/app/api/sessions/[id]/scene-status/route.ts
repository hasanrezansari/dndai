import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import {
  loadSessionSceneStatus,
} from "@/server/services/session-state-payload";

/**
 * Minimal JSON for scene image / pending sync (no full hydrate, no presence write).
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

    const payload = await loadSessionSceneStatus(sessionId);
    if (!payload) {
      return apiError("Not found", 404);
    }

    return NextResponse.json(payload);
  } catch (e) {
    return handleApiError(e);
  }
}
