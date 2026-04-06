import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { generatePortraitImageOpenRouter } from "@/lib/ai/openrouter-image-provider";
import { CHARACTER_RACE_MAX_LEN, normalizeCharacterRace } from "@/lib/rules/character";
import {
  gatePortraitWithSparks,
  refundPortraitSparksIfNeeded,
} from "@/server/services/spark-portrait-gate";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(48),
  heroClass: z.string().trim().min(1).max(60),
  race: z.string().trim().min(1).max(CHARACTER_RACE_MAX_LEN + 8),
  concept: z.string().trim().max(220).optional(),
  appearance: z.string().trim().max(220).optional(),
  // If true, treat as reroll (paid); for now we gate it.
  reroll: z.boolean().optional(),
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

    const raceNorm = normalizeCharacterRace(parsed.data.race);
    if (!raceNorm.ok) return apiError(raceNorm.error, 400);

    const gate = await gatePortraitWithSparks({
      userId: user.id,
      reroll: Boolean(parsed.data.reroll),
      keyPrefix: "session_char",
    });
    if (!gate.ok) {
      return gate.response;
    }

    const prompt = [
      `Character name: ${parsed.data.name}.`,
      `Class: ${parsed.data.heroClass}. Race: ${raceNorm.value}.`,
      parsed.data.concept ? `Concept: ${parsed.data.concept}.` : "",
      parsed.data.appearance ? `Appearance: ${parsed.data.appearance}.` : "",
      "Portrait rules: single character only, chest-up, heroic, readable silhouette, no text.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const out = await generatePortraitImageOpenRouter({
        prompt,
        negativePrompt: "text, watermark, logo, UI, extra limbs, multiple faces",
      });

      const dataUrl = `data:image/png;base64,${out.base64}`;
      return NextResponse.json({ portraitUrl: dataUrl }, { status: 201 });
    } catch (e) {
      await refundPortraitSparksIfNeeded({
        userId: user.id,
        paidIdempotencyKey: gate.paidIdempotencyKey,
      });
      return handleApiError(e);
    }
  } catch (e) {
    return handleApiError(e);
  }
}

