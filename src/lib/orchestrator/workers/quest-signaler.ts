import type { AIProvider, OrchestrationStepResult } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";
import {
  QuestSignalOutputSchema,
  type QuestSignalOutput,
} from "@/lib/schemas/ai-io";
import type { DiceRoll } from "@/lib/schemas/domain";

export const QUEST_SIGNALER_SYSTEM = `You generate one concise quest hint for the table's next beat.

Rules:
- Respond as JSON only.
- Keep "signal_text" practical and actionable for the next turn (genre-agnostic: investigation, social, travel, combat, etc.).
- Keep "signal_text" to 1 short sentence (max 18 words).
- Signal must connect objective + latest action + latest narration.
- Never output spoilers or impossible knowledge.
- Keep tone in-world but concise.
- "focus_term" should be a short noun phrase (1-4 words).
- "suggested_sub_objective" is optional and should be under 10 words.
- Confidence should reflect certainty from provided context (0 to 1).
- "closure_ready": set true only if the fiction and objective together make it believable that the party could end the session on a satisfying note *right now* (not merely that progress is high). If unsure, false.`;

function fallbackSignal(params: {
  round: number;
  rollResult: DiceRoll["result"] | undefined;
}): QuestSignalOutput {
  const outcome =
    params.rollResult === "critical_success" || params.rollResult === "success"
      ? "opens"
      : params.rollResult === "critical_failure" || params.rollResult === "failure"
        ? "complicates"
        : "shifts";
  const focusTerm = "main trail";
  return QuestSignalOutputSchema.parse({
    signal_text: `Signal ${params.round}: ${focusTerm} ${outcome}; press it now.`,
    focus_term: focusTerm,
    suggested_sub_objective: `Press ${focusTerm} with a decisive action`,
    confidence: 0.62,
    closure_ready: false,
  });
}

export async function generateQuestSignal(params: {
  sessionId: string;
  turnId: string | null;
  objective: string;
  actionType: string;
  actionText?: string;
  recentNarrative?: string;
  round: number;
  rollResult: DiceRoll["result"] | undefined;
  risk: number;
  progress: number;
  provider: AIProvider;
}): Promise<OrchestrationStepResult<QuestSignalOutput>> {
  const userPrompt = JSON.stringify({
    objective: params.objective,
    action_type: params.actionType,
    action_text: params.actionText ?? "",
    recent_narrative: params.recentNarrative ?? "",
    round: params.round,
    roll_result: params.rollResult ?? "unknown",
    risk: params.risk,
    progress: params.progress,
  });

  return runOrchestrationStep({
    stepName: "quest_signaler",
    sessionId: params.sessionId,
    turnId: params.turnId,
    provider: params.provider,
    model: "light",
    systemPrompt: QUEST_SIGNALER_SYSTEM,
    userPrompt,
    schema: QuestSignalOutputSchema,
    maxTokens: 120,
    temperature: 0.35,
    fallback: () =>
      fallbackSignal({
        round: params.round,
        rollResult: params.rollResult,
      }),
    timeoutMs: 8_000,
  });
}

