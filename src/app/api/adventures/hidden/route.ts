import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { listHiddenAdventuresForUser } from "@/server/services/adventure-service";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const adventures = await listHiddenAdventuresForUser(user.id);
    return NextResponse.json({ adventures });
  } catch (e) {
    return handleApiError(e);
  }
}
