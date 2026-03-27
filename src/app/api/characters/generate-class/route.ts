import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { apiError, handleApiError } from "@/lib/api/errors";
import { requireUser, unauthorizedResponse } from "@/lib/auth/guards";
import { isCustomClassesEnabled } from "@/lib/config/features";
import { ClassProfileRoleSchema } from "@/lib/schemas/domain";
import { generateCustomClassProfileFromAI } from "@/server/services/custom-class-generation-service";

const GenerateClassBodySchema = z.object({
  concept: z.string().trim().min(3).max(180),
  rolePreference: ClassProfileRoleSchema.optional(),
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

    const profile = await generateCustomClassProfileFromAI({
      concept: parsed.data.concept,
      rolePreference: parsed.data.rolePreference,
    });

    return NextResponse.json({ classProfile: profile }, { status: 200 });
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
