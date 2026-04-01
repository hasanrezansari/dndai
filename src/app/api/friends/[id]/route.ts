import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { removeFriendEdge } from "@/server/services/friend-service";

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Invalid user id", 400);
    await removeFriendEdge({ userId: user.id, friendUserId: params.data.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

