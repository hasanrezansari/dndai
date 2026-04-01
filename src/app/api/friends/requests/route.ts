import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { listFriendRequestsForUser } from "@/server/services/friend-service";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const out = await listFriendRequestsForUser({ userId: user.id });
    return NextResponse.json(out);
  } catch (e) {
    return handleApiError(e);
  }
}

