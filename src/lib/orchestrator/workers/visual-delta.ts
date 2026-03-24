import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  VisualDeltaOutputSchema,
  type VisualDeltaOutput,
} from "@/lib/schemas/ai-io";

const VISUAL_SYSTEM = `You are a visual change detector for a tabletop RPG. Compare the latest narrative with the current scene description.
Determine if the visual scene has significantly changed (new location, dramatic event, major environmental change).
Minor actions (talking, picking up small items, brief dialogue) do NOT warrant a new image.
Respond with valid JSON: image_needed (boolean), reasons (array of short strings explaining the decision), priority one of low, normal, high.`;

export async function checkVisualDelta(params: {
  sessionId: string;
  turnId: string;
  narrativeText: string;
  currentSceneDescription: string | null;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<VisualDeltaOutput>> {
  const userPrompt = JSON.stringify({
    narrative_text: params.narrativeText,
    current_scene_description: params.currentSceneDescription,
  });

  return runOrchestrationStep({
    stepName: "visual_delta",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "light",
    systemPrompt: VISUAL_SYSTEM,
    userPrompt,
    schema: VisualDeltaOutputSchema,
    maxTokens: 256,
    temperature: 0.3,
    fallback: () =>
      VisualDeltaOutputSchema.parse({
        image_needed: false,
        reasons: [],
        priority: "normal",
      }),
  });
}
