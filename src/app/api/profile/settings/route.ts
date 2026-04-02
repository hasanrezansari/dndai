import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import {
  getOrCreateProfileSettings,
  setPublicProfileEnabled,
} from "@/server/services/profile-hero-service";

const PatchSchema = z.object({
  publicProfileEnabled: z.boolean(),
});

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const settings = await getOrCreateProfileSettings(user.id);
    return NextResponse.json(settings);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);
    await setPublicProfileEnabled(user.id, parsed.data.publicProfileEnabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

