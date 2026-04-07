import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api/errors";
import {
  isSessionMember,
  requireUser,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import {
  BetrayalServiceError,
  transitionBetrayalPhase,
} from "@/server/services/betrayal-service";

const BodySchema = z.object({
  targetPhase: z.enum(["rogue_intent", "confronting", "idle"]),
  instigatorPlayerId: z.string().uuid().nullable().optional(),
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

    const result = await transitionBetrayalPhase({
      sessionId,
      userId: user.id,
      targetPhase: parsed.data.targetPhase,
      instigatorPlayerId: parsed.data.instigatorPlayerId ?? undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof BetrayalServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return handleApiError(e);
  }
}
