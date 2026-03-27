import { z } from "zod";

import { getAIProvider } from "@/lib/ai";
import { ClassProfileRoleSchema, ClassProfileSchema } from "@/lib/schemas/domain";

export async function generateCustomClassProfileFromAI(params: {
  concept: string;
  rolePreference?: z.infer<typeof ClassProfileRoleSchema>;
}) {
  const provider = getAIProvider();
  const systemPrompt = `You generate balanced custom RPG class profiles for Ashveil.
Return ONLY JSON that matches the provided schema.

Hard requirements:
- source must be "custom"
- class fantasy must reflect the player's concept prompt
- keep mechanics balanced and playable at level 1
- no overpowered kits
- prefer clear, flavorful ability and gear names
- visual_tags should help image consistency across scenes

Balance requirements:
- exactly 3 abilities (2 active, 1 passive)
- exactly 3 starting_gear items
- stat_bias values should fit archetype but remain bounded
- include tradeoffs (no class is best at everything)`;

  const userPrompt = JSON.stringify({
    concept: params.concept,
    role_preference: params.rolePreference ?? null,
    output_rules: {
      source: "custom",
      abilities_count: 3,
      starting_gear_count: 3,
    },
  });
  const result = await provider.generateStructured({
    model: "light",
    systemPrompt,
    userPrompt,
    schema: ClassProfileSchema,
    maxTokens: 700,
    temperature: 0.35,
  });

  // AI-first path: successful generation must come from model output,
  // then be bounded by schema and normalized fields.
  return ClassProfileSchema.parse({
    ...result.data,
    source: "custom",
    concept_prompt: params.concept,
    display_name:
      result.data.display_name?.trim().slice(0, 40) ||
      params.concept.trim().slice(0, 40),
    fantasy:
      result.data.fantasy?.trim().slice(0, 180) ||
      params.concept.trim().slice(0, 180),
  });
}

