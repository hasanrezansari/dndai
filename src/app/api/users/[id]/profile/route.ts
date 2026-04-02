import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { authUsers, profileHeroes, userProfileSettings } from "@/lib/db/schema";

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireUser();
    if (!viewer) return unauthorizedResponse();
    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Invalid user id", 400);
    const userId = params.data.id;

    const [settings] = await db
      .select({ enabled: userProfileSettings.public_profile_enabled })
      .from(userProfileSettings)
      .where(eq(userProfileSettings.user_id, userId))
      .limit(1);
    if (!settings?.enabled) {
      return apiError("Not found", 404);
    }

    const [userRow] = await db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        image: authUsers.image,
      })
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    if (!userRow) return apiError("Not found", 404);

    const heroes = await db
      .select()
      .from(profileHeroes)
      .where(and(eq(profileHeroes.user_id, userId), eq(profileHeroes.is_public, true)));

    return NextResponse.json({
      user: {
        id: userRow.id,
        name: userRow.name ?? "Adventurer",
        image: userRow.image ?? null,
      },
      heroes: heroes.map((h) => ({
        id: h.id,
        userId: h.user_id,
        name: h.name,
        heroClass: h.hero_class,
        race: h.race,
        statsTemplate: h.stats_template,
        abilitiesTemplate: h.abilities_template,
        visualProfile: h.visual_profile,
        isPublic: Boolean(h.is_public),
        createdAt: h.created_at.toISOString(),
        updatedAt: h.updated_at.toISOString(),
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

