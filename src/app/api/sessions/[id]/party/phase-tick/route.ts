import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import {
  tryPartyForgeryGuessDeadlineAdvance,
  tryPartyMergeWhenReady,
  tryPartyRevealDeadlineAdvance,
  tryPartyVoteDeadlineAdvance,
} from "@/server/services/party-phase-service";

/**
 * Lets clients nudge submit-phase deadline merges without posting a new line.
 * Party sessions only; no-op for campaign.
 */
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

    await tryPartyMergeWhenReady(sessionId);
    await tryPartyForgeryGuessDeadlineAdvance(sessionId);
    await tryPartyVoteDeadlineAdvance(sessionId);
    await tryPartyRevealDeadlineAdvance(sessionId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
