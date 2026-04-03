import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import {
  hideAdventureForUser,
  unhideAdventureForUser,
} from "@/server/services/adventure-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }
    if (!(await isSessionMember(sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    await hideAdventureForUser(user.id, sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return apiError("Invalid session id", 400);
    }
    if (!(await isSessionMember(sessionId, user.id))) {
      return apiError("Forbidden", 403);
    }

    await unhideAdventureForUser(user.id, sessionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
