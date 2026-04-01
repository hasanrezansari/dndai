import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import {
  getOrCreateProfileSettings,
  listProfileHeroesForUser,
  ProfileHeroSlotLimitError,
  setPublicProfileEnabled,
  upsertSingleProfileHero,
} from "@/server/services/profile-hero-service";

const UpsertHeroSchema = z.object({
  name: z.string().trim().min(1).max(48),
  heroClass: z.string().trim().min(1).max(40),
  race: z.string().trim().min(1).max(24),
  statsTemplate: CharacterStatsSchema.nullable().optional(),
  abilitiesTemplate: z.array(z.unknown()).optional(),
  visualProfile: z.record(z.string(), z.unknown()).optional(),
  isPublic: z.boolean().optional(),
  // Convenience: allow toggling global visibility from the same form if desired.
  publicProfileEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const [heroes, settings] = await Promise.all([
      listProfileHeroesForUser(user.id),
      getOrCreateProfileSettings(user.id),
    ]);
    return NextResponse.json({
      heroes,
      publicProfileEnabled: settings.publicProfileEnabled,
      freeSlots: 1,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

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
    const parsed = UpsertHeroSchema.safeParse(json);
    if (!parsed.success) return apiError("Invalid body", 400);

    if (typeof parsed.data.publicProfileEnabled === "boolean") {
      await setPublicProfileEnabled(user.id, parsed.data.publicProfileEnabled);
    }

    try {
      const hero = await upsertSingleProfileHero({
        userId: user.id,
        name: parsed.data.name,
        heroClass: parsed.data.heroClass,
        race: parsed.data.race,
        statsTemplate: parsed.data.statsTemplate ?? null,
        abilitiesTemplate: parsed.data.abilitiesTemplate ?? [],
        visualProfile: parsed.data.visualProfile ?? {},
        isPublic: parsed.data.isPublic ?? false,
      });
      return NextResponse.json({ hero }, { status: 201 });
    } catch (err) {
      if (err instanceof ProfileHeroSlotLimitError) {
        return apiError("Hero slot limit reached", 409);
      }
      throw err;
    }
  } catch (e) {
    return handleApiError(e);
  }
}

