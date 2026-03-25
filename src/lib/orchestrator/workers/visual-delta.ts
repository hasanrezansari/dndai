import type { OrchestrationStepResult } from "@/lib/ai/types";
import {
  VisualDeltaOutputSchema,
  type VisualDeltaOutput,
} from "@/lib/schemas/ai-io";

const LOCATION_WORDS = /\b(enter|arrive|travel|descend|ascend|emerge|cross|portal|door|gate|cave|forest|dungeon|castle|tower|village|temple|tomb|chamber|hall|throne|river|mountain|cliff|bridge)\b/i;
const DRAMATIC_WORDS = /\b(explod|collaps|transform|summon|dragon|demon|fire|flood|earthquake|lightning|storm|destroy|shatter|crumble|rise|awaken)\b/i;

export async function checkVisualDelta(params: {
  sessionId: string;
  turnId: string;
  narrativeText: string;
  currentSceneDescription: string | null;
}): Promise<OrchestrationStepResult<VisualDeltaOutput>> {
  const t0 = Date.now();
  const text = params.narrativeText;
  const reasons: string[] = [];

  if (LOCATION_WORDS.test(text)) reasons.push("Location change detected");
  if (DRAMATIC_WORDS.test(text)) reasons.push("Dramatic visual event");

  const imageNeeded = reasons.length > 0;
  const priority = reasons.length >= 2 ? "high" : imageNeeded ? "normal" : "low";

  const data = VisualDeltaOutputSchema.parse({
    image_needed: imageNeeded,
    reasons,
    priority,
  });

  return {
    data,
    usage: { inputTokens: 0, outputTokens: 0, model: "deterministic" },
    latencyMs: Date.now() - t0,
    success: true,
  };
}
