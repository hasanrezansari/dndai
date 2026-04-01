import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { listPlayedWithUsers } from "@/server/services/friend-service";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? z.coerce.number().int().min(1).max(50).catch(20).parse(limitRaw) : 20;
    const users = await listPlayedWithUsers({ userId: user.id, limit });
    return NextResponse.json({ users });
  } catch (e) {
    return handleApiError(e);
  }
}

