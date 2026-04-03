import { NextResponse, type NextRequest } from "next/server";

import { apiError, handleApiError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getPublishedWorldBySlug,
  getWorldLikeCount,
  userLikesWorld,
  worldRowToDetailDto,
  WorldSlugParamSchema,
} from "@/server/services/world-service";

type RouteContext = { params: Promise<{ slug: string }> };

/** Public world detail (published only — drafts behave as 404). */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const parsed = WorldSlugParamSchema.safeParse(slug);
    if (!parsed.success) {
      return apiError("Not found", 404);
    }
    const row = await getPublishedWorldBySlug(parsed.data);
    if (!row) {
      return apiError("Not found", 404);
    }
    const likeCount = await getWorldLikeCount(row.id);
    const user = await getCurrentUser();
    const liked =
      user != null ? await userLikesWorld(user.id, row.id) : undefined;
    return NextResponse.json(
      worldRowToDetailDto(row, {
        likeCount,
        ...(user != null ? { liked } : {}),
      }),
      { status: 200 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
