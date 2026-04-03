import { buildToneBiasFromAdventureTags } from "@/lib/ai/narrative-session-profile";
import type { AIProvider } from "@/lib/ai/types";
import { PartyMergeOutputSchema, type PartyMergeOutput } from "@/lib/schemas/ai-io";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";

export const PARTY_MERGE_SYSTEM = `You merge multiple player contributions into ONE short story beat for a party game.

Rules:
- Output JSON only with key "merged_beat".
- Length: about 80–160 words. One or two tight paragraphs.
- Honor the table's genre from premise/tags — do not default to medieval fantasy unless the context clearly implies it.
- Weave every player's line in fairly; you may smooth grammar but keep their intent.
- You are a structural guide, not the comedian — wit comes from the players' words.
- No bullet lists. No player names unless the input used them.
- If a "carry_forward" snippet is provided, integrate it naturally as continuity from the previous round.`;

export async function runPartyMergeWorker(params: {
  sessionId: string;
  provider: AIProvider;
  userPayload: Record<string, unknown>;
}): Promise<PartyMergeOutput> {
  const tagsRaw = params.userPayload.adventure_tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((t) => String(t))
    : [];
  const toneBias = buildToneBiasFromAdventureTags(tags);
  const spine =
    typeof params.userPayload.template_spine === "string"
      ? params.userPayload.template_spine.trim()
      : "";
  const milestone =
    typeof params.userPayload.round_milestone === "string"
      ? params.userPayload.round_milestone.trim()
      : "";
  const spineBlock = [
    spine ? `Template spine: ${spine}` : "",
    milestone ? `Round milestone: ${milestone}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const systemPrompt =
    PARTY_MERGE_SYSTEM +
    (spineBlock ? `\n${spineBlock}` : "") +
    (toneBias ? `\n${toneBias}` : "");

  const userPrompt = JSON.stringify(params.userPayload);
  const result = await runOrchestrationStep({
    stepName: "party_merge",
    sessionId: params.sessionId,
    turnId: null,
    provider: params.provider,
    model: "heavy",
    systemPrompt,
    userPrompt,
    schema: PartyMergeOutputSchema,
    maxTokens: 900,
    temperature: 0.65,
    timeoutMs: 45_000,
    fallback: () => ({
      merged_beat:
        typeof params.userPayload.lines === "string"
          ? String(params.userPayload.lines).slice(0, 2000)
          : "The table's voices collide and settle into a single strange moment — the story staggers forward together.",
    }),
  });
  return result.data;
}
