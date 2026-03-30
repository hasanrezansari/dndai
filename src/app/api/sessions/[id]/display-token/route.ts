import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { signDisplayToken } from "@/lib/display-token";

export async function POST(
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

    let token: string;
    let expiresAtIso: string;
    try {
      const out = await signDisplayToken(sessionId);
      token = out.token;
      expiresAtIso = out.expiresAtIso;
    } catch {
      return apiError("Display tokens not configured", 503);
    }

    const path = `/session/${sessionId}/display?t=${encodeURIComponent(token)}`;
    return NextResponse.json({
      token,
      expiresAt: expiresAtIso,
      path,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
