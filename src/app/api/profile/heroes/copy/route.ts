import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError, insufficientSparksResponse } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { SPARK_COST_EXTRA_HERO_SLOT } from "@/lib/spark-pricing";
import {
  copyPublicHeroToUser,
  decrementPurchasedHeroSlots,
  incrementPurchasedHeroSlots,
  ProfileHeroSlotLimitError,
  PublicProfileDisabledError,
} from "@/server/services/profile-hero-service";
import {
  InsufficientSparksError,
  isMonetizationSpendEnabled,
  tryCreditSparks,
  tryDebitSparks,
} from "@/server/services/spark-economy-service";

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
      if (err instanceof PublicProfileDisabledError) {
        return apiError("This player's public profile is disabled", 403);
      }
      if (!(err instanceof ProfileHeroSlotLimitError)) {
        throw err;
      }
      if (!isMonetizationSpendEnabled()) {
        return apiError(
          "Hero slot limit reached. Extra slots cost Sparks.",
          402,
        );
      }
      const slotKey = `extra_hero_slot_copy:${user.id}:${randomUUID()}`;
      try {
        await tryDebitSparks({
          payerUserId: user.id,
          amount: SPARK_COST_EXTRA_HERO_SLOT,
          idempotencyKey: slotKey,
          sessionId: null,
          reason: "extra_profile_hero_slot_copy",
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
        const hero = await copyPublicHeroToUser({
          viewerUserId: user.id,
          fromHeroId: parsed.data.fromHeroId,
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
            reason: "refund_hero_slot_copy_after_failed_copy",
          });
        } catch (refundErr) {
          console.error("[sparks] hero slot copy refund failed", refundErr);
        }
        if (inner instanceof PublicProfileDisabledError) {
          return apiError("This player's public profile is disabled", 403);
        }
        throw inner;
      }
    }
  } catch (e) {
    return handleApiError(e);
  }
}

