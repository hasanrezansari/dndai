import { getPartyRoundMilestone } from "@/lib/party/party-templates";
import type { PartyConfigV1 } from "@/lib/schemas/party";
import { LOBBY_TONE_TAG_OPTIONS } from "@/lib/session/tone-tag-options";

/** Session row fields needed to compose party “Scene” copy. */
export type PartySessionRowNarrativeSlice = {
  adventure_prompt?: string | null;
  adventure_tags?: unknown;
  world_bible?: string | null;
  art_direction?: string | null;
};

/** Human-readable tone line from `adventure_tags` (lobby pills). */
export function partyToneLineFromTags(tags: unknown): string | null {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const labels = tags
    .map((t) => String(t).trim())
    .filter(Boolean)
    .map(
      (id) =>
        LOBBY_TONE_TAG_OPTIONS.find((o) => o.id === id)?.label ?? id.replace(/_/g, " "),
    );
  if (labels.length === 0) return null;
  return `Table tone: ${labels.join(", ")}. Everyone shares the same moment — pitch a line that fits this vibe.`;
}

const PARTY_DEFAULT_SEED =
  "Party game — same scene, many voices. Add a line for what happens next; the table votes on which direction sticks.";

/**
 * Full “Scene” copy for party submit / tiebreak submit (matches what we send for round art).
 */
export function buildPartySubmitSceneText(params: {
  adventurePrompt: string | null | undefined;
  adventureTags: unknown;
  worldBible: string | null | undefined;
  sharedRoleLabel?: string | null;
  carryForward?: string | null;
  roundMilestone?: string | null;
}): string {
  const chunks: string[] = [];
  const lens = params.sharedRoleLabel?.trim();
  if (lens) {
    chunks.push(
      `You're all steering the same moment — shared lens: ${lens}`,
    );
  }

  const prem = params.adventurePrompt?.trim() ?? "";
  const wb = params.worldBible?.trim() ?? "";

  if (prem) {
    chunks.push(prem);
  } else if (wb) {
    const excerpt = wb.slice(0, 900).trim();
    chunks.push(
      excerpt.length < wb.length ? `${excerpt}…` : excerpt,
    );
  } else {
    const tone = partyToneLineFromTags(params.adventureTags);
    chunks.push(tone ?? PARTY_DEFAULT_SEED);
  }

  const ms = params.roundMilestone?.trim();
  if (ms) chunks.push(`Round focus: ${ms}`);

  const carry = params.carryForward?.trim();
  if (carry) chunks.push(`Where we left off: ${carry}`);

  return chunks.join("\n\n");
}

/** After the AI round opener, show lens / milestone / carry + a single CTA (avoid repeating the full seed). */
export function buildPartySubmitHintAfterAiOpener(params: {
  sharedRoleLabel?: string | null;
  carryForward?: string | null;
  roundMilestone?: string | null;
}): string {
  const chunks: string[] = [];
  const lens = params.sharedRoleLabel?.trim();
  if (lens) {
    chunks.push(`Shared lens: ${lens}`);
  }
  const ms = params.roundMilestone?.trim();
  if (ms) {
    chunks.push(`Round focus: ${ms}`);
  }
  const carry = params.carryForward?.trim();
  if (carry) {
    chunks.push(`Where we left off: ${carry}`);
  }
  chunks.push(
    "Everyone adds one line below. The table merges contributions and votes on which direction sticks.",
  );
  return chunks.join("\n\n");
}

/**
 * Full Scene panel text for party submit / tiebreak submit (matches image + player expectations).
 */
export function buildPartySessionNarrativeText(params: {
  partyPhase: PartyConfigV1["party_phase"];
  sessionRow: PartySessionRowNarrativeSlice;
  partyConfig: PartyConfigV1;
}): string {
  const pc = params.partyConfig;
  const ms = getPartyRoundMilestone(pc.template_key, pc.round_index);
  const seedBlock = buildPartySubmitSceneText({
    adventurePrompt: params.sessionRow.adventure_prompt,
    adventureTags: params.sessionRow.adventure_tags,
    worldBible: params.sessionRow.world_bible,
    sharedRoleLabel: pc.shared_role_label,
    carryForward: pc.carry_forward,
    roundMilestone: ms,
  });

  if (params.partyPhase === "tiebreak_submit") {
    const merged = pc.merged_beat?.trim();
    if (merged) {
      return `${merged}\n\n—\n\nVotes tied — only tied players submit a fresh line. Below: round context.\n\n${seedBlock}`;
    }
    return seedBlock;
  }

  if (params.partyPhase === "submit") {
    const ai = pc.round_scene_beat?.trim();
    if (ai) {
      return `${ai}\n\n—\n\n${buildPartySubmitHintAfterAiOpener({
        sharedRoleLabel: pc.shared_role_label,
        carryForward: pc.carry_forward,
        roundMilestone: ms,
      })}`;
    }
    return seedBlock;
  }

  return seedBlock;
}

/** Narrative string to send to the party scene-image pipeline (rich, single block). */
export function buildPartySceneImageNarrativeText(params: {
  sessionRow: PartySessionRowNarrativeSlice;
  partyConfig: PartyConfigV1;
}): string {
  const pc = params.partyConfig;
  const phase =
    pc.party_phase === "tiebreak_submit" ? "tiebreak_submit" : "submit";
  const core = buildPartySessionNarrativeText({
    partyPhase: phase,
    sessionRow: params.sessionRow,
    partyConfig: pc,
  });
  const ad = params.sessionRow.art_direction?.trim();
  if (ad) {
    return `${core}\n\nVisual direction: ${ad.slice(0, 400)}`;
  }
  return core;
}
