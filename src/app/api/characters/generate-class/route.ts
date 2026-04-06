import { createHash } from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError, insufficientSparksResponse } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { isCustomClassesEnabled } from "@/lib/config/features";
import { ClassProfileRoleSchema } from "@/lib/schemas/domain";
import { SPARK_COST_CUSTOM_CLASS_GENERATION } from "@/lib/spark-pricing";
import {
  InsufficientSparksError,
  isMonetizationSpendEnabled,
  tryCreditSparks,
  tryDebitSparks,
} from "@/server/services/spark-economy-service";
import { generateCustomClassProfileFromAI } from "@/server/services/custom-class-generation-service";

const GenerateClassBodySchema = z.object({
  concept: z.string().trim().min(3).max(180),
  rolePreference: ClassProfileRoleSchema.optional(),
  /** Table premise so abilities/gear fit the campaign (optional). */
  adventure_prompt: z.string().trim().max(8000).optional(),
  adventure_tags: z.array(z.string().trim().max(48)).max(24).optional(),
  world_bible: z.string().trim().max(12000).optional(),
  art_direction: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    if (!isCustomClassesEnabled()) {
      return apiError("Custom classes are currently disabled", 403);
    }
    const user = await requireUser();
    if (!user) return unauthorizedResponse();

    const json: unknown = await request.json();
    const parsed = GenerateClassBodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("Invalid body", 400);
    }

    const idemBody = createHash("sha256")
      .update(JSON.stringify(parsed.data))
      .digest("hex")
      .slice(0, 32);
    const idempotencyKey = `generate_class:${user.id}:${idemBody}`;

    let classDebited = false;
    if (isMonetizationSpendEnabled()) {
      try {
        const r = await tryDebitSparks({
          payerUserId: user.id,
          amount: SPARK_COST_CUSTOM_CLASS_GENERATION,
          idempotencyKey,
          sessionId: null,
          reason: "custom_class_generation",
        });
        classDebited = r.applied;
      } catch (e) {
        if (e instanceof InsufficientSparksError) {
          return insufficientSparksResponse({
            balance: e.balance,
            required: e.required,
          });
        }
        throw e;
      }
    }

    try {
      const profile = await generateCustomClassProfileFromAI({
        concept: parsed.data.concept,
        rolePreference: parsed.data.rolePreference,
        sessionPremise: {
          adventure_prompt: parsed.data.adventure_prompt,
          adventure_tags: parsed.data.adventure_tags,
          world_bible: parsed.data.world_bible,
          art_direction: parsed.data.art_direction,
        },
      });

      return NextResponse.json({ classProfile: profile }, { status: 200 });
    } catch (genErr) {
      if (classDebited && isMonetizationSpendEnabled()) {
        try {
          await tryCreditSparks({
            userId: user.id,
            amount: SPARK_COST_CUSTOM_CLASS_GENERATION,
            idempotencyKey: `refund:${idempotencyKey}`,
            sessionId: null,
            reason: "refund_custom_class_failed",
          });
        } catch (refundErr) {
          console.error("[sparks] class gen refund failed", refundErr);
        }
      }
      throw genErr;
    }
  } catch (e) {
    if (e instanceof Error) {
      const msg = e.message.toLowerCase();
      if (
        msg.includes("timeout") ||
        msg.includes("429") ||
        msg.includes("quota") ||
        msg.includes("credit balance is too low") ||
        msg.includes("insufficient credits") ||
        msg.includes("zoderror") ||
        msg.includes("invalid input")
      ) {
        return apiError("Class generation is temporarily unavailable. Try again.", 503);
      }
    }
    return handleApiError(e);
  }
}
