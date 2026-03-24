import {
  ActionIntentSchema,
  NarratorOutputSchema,
  RulesInterpreterOutputSchema,
  VisualDeltaOutputSchema,
} from "@/lib/schemas/ai-io";

import type { AIProvider, TokenUsage } from "@/lib/ai/types";
import type { ModelTier, ZodSchema } from "@/lib/ai/types";

const ZERO_USAGE = (model: string): TokenUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  model,
});

const MOCK_MODEL = "mock";

const FIXTURE_NARRATOR = {
  scene_text:
    "Torches gutter along wet stone while steel whispers against leather in the hush before violence. Breath fogs the cold air, bright with iron and old smoke, and the floor drinks the tiny sounds of shifting weight. Shadows crawl like slow ink across carved pillars, each flicker suggesting motion where nothing yet moves. The strike lands with a crack that rings sharper than fair, and the chamber seems to lean inward, listening. Dust lifts in a pale breath, then settles as hearts remember how to beat. The moment unspools in texture: damp grit underfoot, a far-off drip keeping time, the metallic tang of fear and resolve braided together. When the echo finally thins, eyes lift toward the threshold because stories, like fights, always ask who speaks next. Elena, your turn to shape what follows.",
  visible_changes: ["Tension holds the room."],
  tone: "dramatic",
  next_actor_id: null as string | null,
  image_hint: { subjects: [], avoid: [] },
};

const FIXTURE_INTENT = {
  action_type: "other" as const,
  targets: [],
  skill_or_save: "none" as const,
  requires_roll: true,
  confidence: 0.85,
  suggested_roll_context: "Mock intent",
};

const FIXTURE_RULES = {
  legal: true,
  rolls: [
    {
      dice: "d20" as const,
      modifier: 0,
      advantage_state: "none" as const,
      context: "Mock rules roll",
    },
  ],
};

const FIXTURE_VISUAL = {
  image_needed: false,
  reasons: [],
  priority: "normal" as const,
};

export class MockProvider implements AIProvider {
  calls: Array<{ method: string; params: unknown }> = [];
  latencyMs = 50;

  private sleep(): Promise<void> {
    return new Promise((r) => setTimeout(r, this.latencyMs));
  }

  private structuredFixture<T>(schema: ZodSchema<T>, userPrompt: string): T {
    const ref = schema as unknown;
    if (ref === NarratorOutputSchema) {
      return NarratorOutputSchema.parse(FIXTURE_NARRATOR) as T;
    }
    if (ref === ActionIntentSchema) {
      if (userPrompt.includes("I attack the goblin")) {
        return ActionIntentSchema.parse({
          action_type: "attack",
          targets: [{ kind: "npc", label: "goblin" }],
          skill_or_save: "none",
          requires_roll: true,
          confidence: 0.92,
          suggested_roll_context: "Melee attack against goblin",
        }) as T;
      }
      return ActionIntentSchema.parse(FIXTURE_INTENT) as T;
    }
    if (ref === RulesInterpreterOutputSchema) {
      if (
        userPrompt.includes('"action_type":"attack"') ||
        userPrompt.includes('"action_type": "attack"')
      ) {
        return RulesInterpreterOutputSchema.parse({
          legal: true,
          rolls: [
            {
              dice: "d20",
              modifier: 5,
              advantage_state: "none",
              context: "Attack roll",
              dc: 15,
            },
            {
              dice: "d8",
              modifier: 3,
              advantage_state: "none",
              context: "Weapon damage",
              dc: 1,
            },
          ],
        }) as T;
      }
      return RulesInterpreterOutputSchema.parse(FIXTURE_RULES) as T;
    }
    if (ref === VisualDeltaOutputSchema) {
      if (
        userPrompt.includes("quiet word with the innkeeper") ||
        userPrompt.includes("You nod politely")
      ) {
        return VisualDeltaOutputSchema.parse({
          image_needed: false,
          reasons: ["Minor social beat; same scene."],
          priority: "low",
        }) as T;
      }
      return VisualDeltaOutputSchema.parse(FIXTURE_VISUAL) as T;
    }
    const parsed = schema.safeParse({});
    if (parsed.success) return parsed.data;
    const parsedArr = schema.safeParse([]);
    if (parsedArr.success) return parsedArr.data;
    throw new Error("MockProvider: unsupported schema");
  }

  async generateStructured<T>(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    schema: ZodSchema<T>;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ data: T; usage: TokenUsage }> {
    this.calls.push({ method: "generateStructured", params });
    await this.sleep();
    const data = this.structuredFixture(params.schema, params.userPrompt);
    return { data, usage: ZERO_USAGE(MOCK_MODEL) };
  }

  async generateText(params: {
    model: ModelTier;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string; usage: TokenUsage }> {
    this.calls.push({ method: "generateText", params });
    await this.sleep();
    return {
      text: "Mock narration line for tests.",
      usage: ZERO_USAGE(MOCK_MODEL),
    };
  }
}
