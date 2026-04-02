import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { isPostgresUndefinedRelationError } from "@/lib/db/pg-errors";
import { listFriendRequestsForUser } from "@/server/services/friend-service";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    try {
      const out = await listFriendRequestsForUser({ userId: user.id });
      return NextResponse.json(out);
    } catch (e) {
      if (isPostgresUndefinedRelationError(e, "friend_requests")) {
        return NextResponse.json({ incoming: [], outgoing: [] });
      }
      throw e;
    }
  } catch (e) {
    return handleApiError(e);
  }
}

