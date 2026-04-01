import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import {
  copyPublicHeroToUser,
  ProfileHeroSlotLimitError,
  PublicProfileDisabledError,
} from "@/server/services/profile-hero-service";

const BodySchema = z.object({
  fromHeroId: z.string().uuid(),
});

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
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);
    try {
      const hero = await copyPublicHeroToUser({
        viewerUserId: user.id,
        fromHeroId: parsed.data.fromHeroId,
      });
      return NextResponse.json({ hero }, { status: 201 });
    } catch (err) {
      if (err instanceof ProfileHeroSlotLimitError) {
        return apiError("Hero slot limit reached", 409);
      }
      if (err instanceof PublicProfileDisabledError) {
        return apiError("This player's public profile is disabled", 403);
      }
      throw err;
    }
  } catch (e) {
    return handleApiError(e);
  }
}

