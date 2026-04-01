import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { respondToFriendRequest } from "@/server/services/friend-service";

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Invalid request id", 400);
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    const out = await respondToFriendRequest({
      userId: user.id,
      requestId: params.data.id,
      action: parsed.data.action,
    });
    if (!out.ok) {
      return apiError(out.reason === "forbidden" ? "Forbidden" : "Not found", out.reason === "forbidden" ? 403 : 404);
    }
    return NextResponse.json(out);
  } catch (e) {
    return handleApiError(e);
  }
}

