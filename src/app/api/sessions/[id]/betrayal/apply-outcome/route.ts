import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import {
  applyHostBetrayalOutcome,
  BetrayalServiceError,
} from "@/server/services/betrayal-service";

const BodySchema = z.object({
  outcomeId: z.string().trim().min(3).max(128),
  traitorPlayerId: z.string().uuid().nullable().optional(),
  macguffinHolderPlayerId: z.string().uuid().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const { id: sessionId } = await context.params;
    if (!z.string().uuid().safeParse(sessionId).success) {
      return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
    }
    if (!(await isSessionMember(sessionId, user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const json: unknown = await request.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const result = await applyHostBetrayalOutcome({
      sessionId,
      hostUserId: user.id,
      outcomeId: parsed.data.outcomeId,
      traitorPlayerId: parsed.data.traitorPlayerId,
      macguffinHolderPlayerId: parsed.data.macguffinHolderPlayerId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof BetrayalServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return handleApiError(e);
  }
}
