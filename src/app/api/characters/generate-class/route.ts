import { createHash } from "crypto";

import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError, insufficientSparksResponse } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { players, sessions } from "@/lib/db/schema";
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
import { buildPremiseRandomConcept } from "@/server/services/premise-random-concept";

const GenerateClassBodySchema = z
  .object({
    concept: z.string().trim().max(180).optional(),
    random_from_premise: z.boolean().optional(),
    session_id: z.string().uuid().optional(),
    rolePreference: ClassProfileRoleSchema.optional(),
    adventure_prompt: z.string().trim().max(8000).optional(),
    adventure_tags: z.array(z.string().trim().max(48)).max(24).optional(),
    world_bible: z.string().trim().max(12000).optional(),
    art_direction: z.string().trim().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    const rf = val.random_from_premise === true;
    if (rf) {
      if (!val.session_id) {
        ctx.addIssue({
          code: "custom",
          message: "session_id is required when random_from_premise is true",
          path: ["session_id"],
        });
      }
    } else {
      const c = val.concept?.trim() ?? "";
      if (c.length < 3) {
        ctx.addIssue({
          code: "custom",
          message: "concept must be at least 3 characters",
          path: ["concept"],
        });
      }
    }
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

    let concept =
      parsed.data.random_from_premise === true
        ? ""
        : (parsed.data.concept ?? "").trim();

    let adventure_prompt = parsed.data.adventure_prompt;
    let adventure_tags = parsed.data.adventure_tags;
    let world_bible = parsed.data.world_bible;
    let art_direction = parsed.data.art_direction;

    let useFreePremiseRandom = false;
    let playerRowId: string | null = null;

    if (parsed.data.random_from_premise === true && parsed.data.session_id) {
      const sid = parsed.data.session_id;
      const [hit] = await db
        .select({
          playerId: players.id,
          freeUsed: players.free_premise_random_used,
          adventure_prompt: sessions.adventure_prompt,
          adventure_tags: sessions.adventure_tags,
          world_bible: sessions.world_bible,
          art_direction: sessions.art_direction,
        })
        .from(players)
        .innerJoin(sessions, eq(players.session_id, sessions.id))
        .where(and(eq(sessions.id, sid), eq(players.user_id, user.id)))
        .limit(1);

      if (!hit) {
        return apiError("Session not found or you are not a player in it", 403);
      }

      playerRowId = hit.playerId;
      useFreePremiseRandom = !hit.freeUsed;

      const tags = Array.isArray(hit.adventure_tags)
        ? hit.adventure_tags.map((t) => String(t))
        : null;

      adventure_prompt = hit.adventure_prompt ?? adventure_prompt;
      adventure_tags = tags ?? adventure_tags;
      world_bible = hit.world_bible ?? world_bible;
      art_direction = hit.art_direction ?? art_direction;

      concept = buildPremiseRandomConcept({
        adventure_prompt: hit.adventure_prompt,
        adventure_tags: tags,
        world_bible: hit.world_bible,
      });
    }

    const idemPayload = {
      ...parsed.data,
      resolvedConcept: concept,
      useFreePremiseRandom,
    };
    const idemBody = createHash("sha256")
      .update(JSON.stringify(idemPayload))
      .digest("hex")
      .slice(0, 32);
    const idempotencyKey = `generate_class:${user.id}:${idemBody}`;

    let classDebited = false;
    const shouldCharge =
      isMonetizationSpendEnabled() &&
      !useFreePremiseRandom;

    if (shouldCharge) {
      try {
        const r = await tryDebitSparks({
          payerUserId: user.id,
          amount: SPARK_COST_CUSTOM_CLASS_GENERATION,
          idempotencyKey,
          sessionId: parsed.data.session_id ?? null,
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
        concept,
        rolePreference: parsed.data.rolePreference,
        sessionPremise: {
          adventure_prompt,
          adventure_tags,
          world_bible,
          art_direction,
        },
      });

      if (useFreePremiseRandom && playerRowId) {
        await db
          .update(players)
          .set({ free_premise_random_used: true })
          .where(eq(players.id, playerRowId));
      }

      return NextResponse.json(
        {
          classProfile: profile,
          usedFreePremiseRandom: useFreePremiseRandom,
        },
        { status: 200 },
      );
    } catch (genErr) {
      if (classDebited && isMonetizationSpendEnabled()) {
        try {
          await tryCreditSparks({
            userId: user.id,
            amount: SPARK_COST_CUSTOM_CLASS_GENERATION,
            idempotencyKey: `refund:${idempotencyKey}`,
            sessionId: parsed.data.session_id ?? null,
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
