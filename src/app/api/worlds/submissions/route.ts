import { NextRequest, NextResponse } from "next/server";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { createWorldSubmission } from "@/server/services/world-ugc-service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const body: unknown = await request.json().catch(() => ({}));
    const created = await createWorldSubmission({
      userId: user.id,
      userEmail: user.email,
      body,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
