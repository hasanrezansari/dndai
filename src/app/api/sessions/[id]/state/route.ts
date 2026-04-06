import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { loadSessionStatePayload } from "@/server/services/session-state-payload";

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

    const payload = await loadSessionStatePayload(sessionId, {
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    if (!payload) {
      return apiError("Not found", 404);
    }

    return NextResponse.json(payload);
  } catch (e) {
    return handleApiError(e);
  }
}
