import { buildToneBiasFromAdventureTags } from "@/lib/ai/narrative-session-profile";
import type { AIProvider } from "@/lib/ai/types";
import {
  PartyRoundOpenerOutputSchema,
  type PartyRoundOpenerOutput,
} from "@/lib/schemas/ai-io";
import { getPartyTemplatePack } from "@/lib/party/party-templates";
import { runOrchestrationStep } from "@/lib/orchestrator/step-runner";

export const PARTY_ROUND_OPENER_SYSTEM = `You are the scene-setter for a collaborative party game (shared moment, many players adding lines later).

The host supplied premise, optional canon (world bible excerpt), tone tags, and art direction. Your job is ONE establishing beat — like a DM’s opening shot for this round.

Rules:
- Output JSON only with key "scene_beat".
- Length: about 100–200 words. One or two tight paragraphs.
- Honor genre from tags and premise — do not default to medieval fantasy unless the inputs clearly imply it.
- Do not mention voting, merging, rounds, or “the game”. Stay in-fiction.
- Do not ask the player a direct question; end on a beat that invites contribution without breaking immersion.
- If a "carry_forward" snippet is present, weave it in as continuity from the previous winning line.`;

export async function runPartyRoundOpenerWorker(params: {
  sessionId: string;
  provider: AIProvider;
  templateKey: string;
  roundIndex: number;
  totalRounds: number;
  milestone: string;
  sharedRoleLabel: string | null;
  carryForward: string | null;
  adventurePrompt: string;
  adventureTags: string[];
  worldBibleExcerpt: string;
  artDirection: string;
}): Promise<string> {
  const pack = getPartyTemplatePack(params.templateKey);
  const toneBias = buildToneBiasFromAdventureTags(params.adventureTags);
  const systemPrompt =
    PARTY_ROUND_OPENER_SYSTEM +
    (pack.mergeSpine ? `\nTemplate spine (tone only): ${pack.mergeSpine.slice(0, 600)}` : "") +
    (toneBias ? `\n${toneBias}` : "");

  const userPayload = {
    round_index: params.roundIndex,
    total_rounds: params.totalRounds,
    round_milestone: params.milestone,
    shared_role_label: params.sharedRoleLabel,
    carry_forward: params.carryForward,
    adventure_prompt: params.adventurePrompt,
    adventure_tags: params.adventureTags,
    world_bible_excerpt: params.worldBibleExcerpt,
    art_direction: params.artDirection,
  };

  const result = await runOrchestrationStep({
    stepName: "party_round_opener",
    sessionId: params.sessionId,
    turnId: null,
    provider: params.provider,
    model: "heavy",
    systemPrompt,
    userPrompt: JSON.stringify(userPayload),
    schema: PartyRoundOpenerOutputSchema,
    maxTokens: 900,
    temperature: 0.7,
    timeoutMs: 45_000,
    fallback: (): PartyRoundOpenerOutput => {
      const bits = [
        params.adventurePrompt.trim(),
        params.milestone.trim(),
        params.carryForward?.trim(),
      ].filter(Boolean);
      const glue =
        bits.length > 0 ? bits.join(" ") : "The moment holds still, waiting.";
      const beat = `${glue.slice(0, 500)} The air shifts; something unspoken asks to be named. The scene is open — what happens next is still in motion.`;
      return {
        scene_beat: beat.length >= 40 ? beat : `${beat} The table leans in as tension gathers and possibility threads through the silence.`,
      };
    },
  });
  return result.data.scene_beat.trim();
}
