import { LOBBY_TONE_TAG_OPTIONS } from "@/lib/session/tone-tag-options";

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
