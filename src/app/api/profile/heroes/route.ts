import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError, insufficientSparksResponse } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { CHARACTER_RACE_MAX_LEN, normalizeCharacterRace } from "@/lib/rules/character";
import { CharacterStatsSchema } from "@/lib/schemas/domain";
import { SPARK_COST_EXTRA_HERO_SLOT } from "@/lib/spark-pricing";
import {
  decrementPurchasedHeroSlots,
  FREE_PROFILE_HERO_SLOTS,
  getOrCreateProfileSettings,
  incrementPurchasedHeroSlots,
  listProfileHeroesForUser,
  ProfileHeroSlotLimitError,
  setPublicProfileEnabled,
  upsertSingleProfileHero,
} from "@/server/services/profile-hero-service";
import {
  InsufficientSparksError,
  isMonetizationSpendEnabled,
  tryCreditSparks,
  tryDebitSparks,
} from "@/server/services/spark-economy-service";

const UpsertHeroSchema = z.object({
  name: z.string().trim().min(1).max(48),
  heroClass: z.string().trim().min(1).max(40),
  race: z.string().trim().min(1).max(CHARACTER_RACE_MAX_LEN + 8),
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
    const maxHeroSlots =
      FREE_PROFILE_HERO_SLOTS + settings.purchasedHeroSlots;
    return NextResponse.json({
      heroes,
      publicProfileEnabled: settings.publicProfileEnabled,
      /** Total hero slots (free + purchased). Client compares to `heroes.length`. */
      freeSlots: maxHeroSlots,
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

    const raceNorm = normalizeCharacterRace(parsed.data.race);
    if (!raceNorm.ok) {
      return apiError(raceNorm.error, 400);
    }

    try {
      const hero = await upsertSingleProfileHero({
        userId: user.id,
        name: parsed.data.name,
        heroClass: parsed.data.heroClass,
        race: raceNorm.value,
        statsTemplate: parsed.data.statsTemplate ?? null,
        abilitiesTemplate: parsed.data.abilitiesTemplate ?? [],
        visualProfile: parsed.data.visualProfile ?? {},
        isPublic: parsed.data.isPublic ?? false,
      });
      return NextResponse.json({ hero }, { status: 201 });
    } catch (err) {
      if (!(err instanceof ProfileHeroSlotLimitError)) {
        throw err;
      }
      if (!isMonetizationSpendEnabled()) {
        return apiError(
          "Hero slot limit reached. Extra slots cost Sparks.",
          402,
        );
      }
      const slotKey = `extra_hero_slot:${user.id}:${randomUUID()}`;
      try {
        await tryDebitSparks({
          payerUserId: user.id,
          amount: SPARK_COST_EXTRA_HERO_SLOT,
          idempotencyKey: slotKey,
          sessionId: null,
          reason: "extra_profile_hero_slot",
        });
      } catch (se) {
        if (se instanceof InsufficientSparksError) {
          return insufficientSparksResponse({
            balance: se.balance,
            required: se.required,
          });
        }
        throw se;
      }
      try {
        await incrementPurchasedHeroSlots(user.id);
        const hero = await upsertSingleProfileHero({
          userId: user.id,
          name: parsed.data.name,
          heroClass: parsed.data.heroClass,
          race: raceNorm.value,
          statsTemplate: parsed.data.statsTemplate ?? null,
          abilitiesTemplate: parsed.data.abilitiesTemplate ?? [],
          visualProfile: parsed.data.visualProfile ?? {},
          isPublic: parsed.data.isPublic ?? false,
        });
        return NextResponse.json({ hero }, { status: 201 });
      } catch (inner) {
        await decrementPurchasedHeroSlots(user.id);
        try {
          await tryCreditSparks({
            userId: user.id,
            amount: SPARK_COST_EXTRA_HERO_SLOT,
            idempotencyKey: `refund:${slotKey}`,
            sessionId: null,
            reason: "refund_hero_slot_after_failed_upsert",
          });
        } catch (refundErr) {
          console.error("[sparks] hero slot refund failed", refundErr);
        }
        throw inner;
      }
    }
  } catch (e) {
    return handleApiError(e);
  }
}

