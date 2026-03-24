import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { rollNewStats } from "@/server/services/character-service";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const stats = await rollNewStats();
    return NextResponse.json({ stats });
  } catch (e) {
    return handleApiError(e);
  }
}
