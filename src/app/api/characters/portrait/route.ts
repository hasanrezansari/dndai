import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { generatePortraitImageOpenRouter } from "@/lib/ai/openrouter-image-provider";
import { CHARACTER_RACE_MAX_LEN, normalizeCharacterRace } from "@/lib/rules/character";
import {
  assertAndConsumeFreePortraitUse,
  PortraitPaymentRequiredError,
} from "@/server/services/profile-hero-service";

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

    if (parsed.data.reroll) {
      return apiError("Portrait reroll costs Sparks", 402);
    }

    try {
      await assertAndConsumeFreePortraitUse(user.id);
    } catch (e) {
      if (e instanceof PortraitPaymentRequiredError) {
        return apiError("Portrait generation costs Sparks", 402);
      }
      throw e;
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

    const out = await generatePortraitImageOpenRouter({
      prompt,
      negativePrompt: "text, watermark, logo, UI, extra limbs, multiple faces",
    });

    const dataUrl = `data:image/png;base64,${out.base64}`;
    return NextResponse.json({ portraitUrl: dataUrl }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

