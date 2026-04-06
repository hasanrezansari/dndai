import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { profileHeroes } from "@/lib/db/schema";
import { generatePortraitImageOpenRouter } from "@/lib/ai/openrouter-image-provider";
import {
  gatePortraitWithSparks,
  refundPortraitSparksIfNeeded,
} from "@/server/services/spark-portrait-gate";

const ParamsSchema = z.object({ id: z.string().uuid() });

const BodySchema = z.object({
  // Optional override prompt for future "paid reroll" flow; kept tight for safety.
  promptHint: z.string().trim().min(0).max(220).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (!user) return unauthorizedResponse();
    const params = ParamsSchema.safeParse(await context.params);
    if (!params.success) return apiError("Invalid hero id", 400);

    const [row] = await db
      .select()
      .from(profileHeroes)
      .where(and(eq(profileHeroes.id, params.data.id), eq(profileHeroes.user_id, user.id)))
      .limit(1);
    if (!row) return apiError("Not found", 404);

    const vp =
      row.visual_profile && typeof row.visual_profile === "object" && !Array.isArray(row.visual_profile)
        ? (row.visual_profile as Record<string, unknown>)
        : {};
    const existing = vp.portrait_url;
    const hasPortrait =
      typeof existing === "string" && existing.trim().length > 0;

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      /* allow empty */
    }
    const body = BodySchema.safeParse(json);
    if (!body.success) return apiError("Invalid body", 400);

    const gate = await gatePortraitWithSparks({
      userId: user.id,
      reroll: hasPortrait,
      keyPrefix: `hero_${params.data.id}`,
    });
    if (!gate.ok) {
      return gate.response;
    }

    const concept = typeof vp.concept === "string" ? vp.concept : "";
    const classProfile =
      vp.class_profile && typeof vp.class_profile === "object" && !Array.isArray(vp.class_profile)
        ? (vp.class_profile as Record<string, unknown>)
        : null;
    const fantasy =
      classProfile && typeof classProfile.fantasy === "string" ? classProfile.fantasy : "";
    const style = body.data.promptHint ?? "";

    const prompt = [
      `Character name: ${row.name}.`,
      `Class: ${row.hero_class}. Race: ${row.race}.`,
      concept ? `Concept: ${concept}.` : "",
      fantasy ? `One-line class pitch: ${fantasy}.` : "",
      style ? `Style hint: ${style}.` : "",
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
      const nextVp: Record<string, unknown> = { ...vp, portrait_url: dataUrl };

      const [updated] = await db
        .update(profileHeroes)
        .set({ visual_profile: nextVp, updated_at: new Date() })
        .where(eq(profileHeroes.id, row.id))
        .returning();

      return NextResponse.json(
        {
          ok: true,
          portraitUrl: dataUrl,
          heroId: updated?.id ?? row.id,
        },
        { status: 201 },
      );
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

