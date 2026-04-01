import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { listFriendsForUser, sendFriendRequest } from "@/server/services/friend-service";

const AddBodySchema = z.object({
  friendUserId: z.string().min(1),
});

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const friends = await listFriendsForUser(user.id);
    return NextResponse.json({ friends });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = AddBodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);
    const out = await sendFriendRequest({
      userId: user.id,
      toUserId: parsed.data.friendUserId,
    });
    return NextResponse.json({ ok: true, ...out }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

