import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import {
  deleteProfileHero,
  setHeroPublicFlag,
} from "@/server/services/profile-hero-service";

const ParamsSchema = z.object({ id: z.string().uuid() });

const PatchSchema = z.object({
  isPublic: z.boolean().optional(),
});

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Invalid hero id", 400);
    await deleteProfileHero({ userId: user.id, heroId: params.data.id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Invalid hero id", 400);
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return apiError("Invalid body", 400);
    }
    const parsed = PatchSchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);
    if (typeof parsed.data.isPublic !== "boolean") {
      return apiError("No changes", 400);
    }
    const hero = await setHeroPublicFlag({
      userId: user.id,
      heroId: params.data.id,
      isPublic: parsed.data.isPublic,
    });
    return NextResponse.json({ hero });
  } catch (e) {
    return handleApiError(e);
  }
}

