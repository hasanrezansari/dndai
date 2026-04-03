import { getAIProvider } from "@/lib/ai";
import { sessions } from "@/lib/db/schema";
import {
  buildInstigatorRoundSlots,
  type PartyRoundSlots,
} from "@/lib/party/party-slot-utils";
import {
  getPartyRoundMilestone,
  getPartyTemplatePack,
} from "@/lib/party/party-templates";
import { runPartyForgeryLineWorker } from "@/lib/orchestrator/workers/party-forgery-line";
import { runPartyMergeWorker } from "@/lib/orchestrator/workers/party-merge";
import type { PartyConfigV1 } from "@/lib/schemas/party";

import { listPartyParticipantPlayerIds } from "@/server/services/party-phase-service";

export type PartyMergeResult = {
  mergedBeat: string;
  /** Present when instigator + 2+ lines + non-empty forgery — enables forgery_guess phase. */
  roundSlots: PartyRoundSlots | null;
};

export async function runPartyMergeForConfig(params: {
  sessionId: string;
  sessionRow: typeof sessions.$inferSelect;
  cfg: PartyConfigV1;
}): Promise<PartyMergeResult> {
  const participantIds = await listPartyParticipantPlayerIds(params.sessionId);
  const subs = params.cfg.submissions ?? {};
  const lines = participantIds
    .map((id) => {
      const s = subs[id];
      return s?.text?.trim() ? { player_id: id, text: s.text.trim() } : null;
    })
    .filter(Boolean) as Array<{ player_id: string; text: string }>;

  const tagRaw = params.sessionRow.adventure_tags;
  const adventureTags = Array.isArray(tagRaw) ? tagRaw.map(String) : [];

  let linesJoined = lines.map((l) => l.text).join("\n---\n");
  const provider = getAIProvider();

  let roundSlots: PartyRoundSlots | null = null;

  if (params.cfg.instigator_enabled && lines.length > 0) {
    try {
      const forgery = await runPartyForgeryLineWorker({
        sessionId: params.sessionId,
        provider,
        realLinesJoined: linesJoined,
        adventurePrompt: params.sessionRow.adventure_prompt?.trim() ?? "",
        adventureTags,
      });
      const trimmed = forgery.trim();
      if (trimmed) {
        if (lines.length >= 2) {
          roundSlots = buildInstigatorRoundSlots({
            playerLines: lines,
            forgeryText: trimmed,
            sessionId: params.sessionId,
            roundIndex: params.cfg.round_index,
          });
        }
        linesJoined += `\n---\n[Anonymous interjection]\n${trimmed}`;
      }
    } catch (e) {
      console.error("[party] forgery line failed", params.sessionId, e);
    }
  }

  const pack = getPartyTemplatePack(params.cfg.template_key);
  const milestone = getPartyRoundMilestone(
    params.cfg.template_key,
    params.cfg.round_index,
  );

  const userPayload = {
    template_key: params.cfg.template_key,
    template_spine: pack.mergeSpine,
    round_milestone: milestone,
    round_index: params.cfg.round_index,
    total_rounds: params.cfg.total_rounds,
    carry_forward: params.cfg.carry_forward ?? null,
    shared_role_label: params.cfg.shared_role_label ?? null,
    adventure_prompt: params.sessionRow.adventure_prompt?.trim() ?? "",
    adventure_tags: adventureTags,
    world_bible_excerpt: (params.sessionRow.world_bible ?? "").slice(0, 4000),
    art_direction: params.sessionRow.art_direction?.trim() ?? "",
    lines: linesJoined,
  };

  const out = await runPartyMergeWorker({
    sessionId: params.sessionId,
    provider,
    userPayload,
  });
  return {
    mergedBeat: out.merged_beat.trim(),
    roundSlots,
  };
}
