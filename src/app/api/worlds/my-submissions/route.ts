import { NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { listMyWorldSubmissions } from "@/server/services/world-ugc-service";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const submissions = await listMyWorldSubmissions(user.id);
    return NextResponse.json({ submissions }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
