import { NextResponse, type NextRequest } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import {
  addWorldLike,
  getPublishedWorldBySlug,
  getWorldLikeCount,
  removeWorldLike,
  WorldSlugParamSchema,
} from "@/server/services/world-service";

type RouteContext = { params: Promise<{ slug: string }> };

async function resolvePublishedWorldId(slug: string) {
  const parsed = WorldSlugParamSchema.safeParse(slug);
  if (!parsed.success) return null;
  const row = await getPublishedWorldBySlug(parsed.data);
  return row?.id ?? null;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const { slug } = await context.params;
    const worldId = await resolvePublishedWorldId(slug);
    if (!worldId) return apiError("Not found", 404);
    await addWorldLike({ userId: user.id, worldId });
    const likeCount = await getWorldLikeCount(worldId);
    return NextResponse.json({ liked: true, likeCount }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const { slug } = await context.params;
    const worldId = await resolvePublishedWorldId(slug);
    if (!worldId) return apiError("Not found", 404);
    await removeWorldLike({ userId: user.id, worldId });
    const likeCount = await getWorldLikeCount(worldId);
    return NextResponse.json({ liked: false, likeCount }, { status: 200 });
  } catch (e) {
    return handleApiError(e);
  }
}
