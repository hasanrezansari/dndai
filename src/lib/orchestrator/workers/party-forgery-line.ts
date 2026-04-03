import { z } from "zod";

import type { AIProvider } from "@/lib/ai/types";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";

const ForgerySchema = z.object({
  line: z.string().max(500),
});

const SYSTEM = `You write ONE short anonymous interjection for a party word game.
Rules:
- Output JSON only with key "line".
- One or two sentences max, under 220 characters if possible.
- Must feel like another player at the table — not narrator, not DM.
- Match the genre implied by the premise; do not default to medieval fantasy.
- Do not copy the real lines verbatim; add a distinct voice or angle.`;

export async function runPartyForgeryLineWorker(params: {
  sessionId: string;
  provider: AIProvider;
  realLinesJoined: string;
  adventurePrompt: string;
  adventureTags: string[];
}): Promise<string> {
  const userPayload = {
    adventure_prompt: params.adventurePrompt,
    adventure_tags: params.adventureTags,
    real_player_lines: params.realLinesJoined.slice(0, 3500),
  };
  const result = await runOrchestrationStep({
    stepName: "party_forgery_line",
    sessionId: params.sessionId,
    turnId: null,
    provider: params.provider,
    model: "light",
    systemPrompt: SYSTEM,
    userPrompt: JSON.stringify(userPayload),
    schema: ForgerySchema,
    maxTokens: 200,
    temperature: 0.9,
    timeoutMs: 20_000,
    fallback: () => ({
      line: "Someone mutters a version nobody quite remembers — and the table pretends they heard it clearly.",
    }),
  });
  return result.data.line.trim();
}
