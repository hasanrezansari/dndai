import type { AIProvider } from "@/lib/ai/types";
import { PartyVoteJudgeOutputSchema } from "@/lib/schemas/ai-io";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";

export const PARTY_VOTE_JUDGE_SYSTEM = `You pick which player line best moves the shared story forward for this party game.

Rules:
- Output JSON only with key "winning_player_id" (UUID string).
- You MUST copy one of the candidate ids exactly from the input; never invent an id.
- Prefer coherence, momentum, and fit with the merged scene and premise.
- No prose outside JSON.`;

export async function runPartyVoteJudgeWorker(params: {
  sessionId: string;
  provider: AIProvider;
  candidates: Array<{ player_id: string; text: string }>;
  mergedBeat: string;
  adventurePrompt: string;
}): Promise<string | null> {
  const ids = new Set(params.candidates.map((c) => c.player_id));
  if (params.candidates.length === 0) return null;
  if (params.candidates.length === 1) return params.candidates[0]!.player_id;

  const userPayload = {
    candidates: params.candidates,
    merged_beat: params.mergedBeat,
    adventure_prompt: params.adventurePrompt,
  };

  const fallbackId = [...params.candidates]
    .sort((a, b) => a.player_id.localeCompare(b.player_id))[0]!.player_id;

  const result = await runOrchestrationStep({
    stepName: "party_vote_judge",
    sessionId: params.sessionId,
    turnId: null,
    provider: params.provider,
    model: "heavy",
    systemPrompt: PARTY_VOTE_JUDGE_SYSTEM,
    userPrompt: JSON.stringify(userPayload),
    schema: PartyVoteJudgeOutputSchema,
    maxTokens: 120,
    temperature: 0.35,
    timeoutMs: 25_000,
    fallback: () => ({ winning_player_id: fallbackId }),
  });
  const pick = result.data.winning_player_id;
  return ids.has(pick) ? pick : fallbackId;
}
