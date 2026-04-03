import { ROMA_SEEDS } from "@/lib/rome/seeder";
import type { RomaModuleKey } from "@/lib/rome/modules";

/** Session fields that affect AI facilitator / style hints (subset of `sessions` row). */
export type SessionNarrativeFields = {
  campaign_mode: string;
  module_key: string | null;
  adventure_prompt: string | null;
  adventure_tags: string[] | null;
  art_direction: string | null;
  world_bible: string | null;
};

export function isPlayRomanaModuleKey(key: string | null | undefined): key is RomaModuleKey {
  return key != null && Object.prototype.hasOwnProperty.call(ROMA_SEEDS, key);
}

/** Lobby tone tag ids (`LOBBY_TONE_TAG_OPTIONS`) → short facilitator nudges. No UI change; rules pipeline unchanged. */
const COZY_TAG_IDS = new Set([
  "wholesome",
  "slice_of_life",
  "romance",
  "social",
]);
const WEIGHT_TAG_IDS = new Set(["horror", "action", "mystery"]);
const COMEDY_TAG_ID = "comedy";

export function buildToneBiasFromAdventureTags(
  tags: string[] | null | undefined,
): string {
  if (!tags?.length) return "";
  const normalized = new Set(
    tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
  );
  const snippets: string[] = [];
  if ([...normalized].some((t) => COZY_TAG_IDS.has(t))) {
    snippets.push(
      "Tone bias (table tags): favor warmth, rapport, and breathing room between sharp beats; avoid gratuitous cynicism or shock unless the premise already calls for it.",
    );
  }
  if ([...normalized].some((t) => WEIGHT_TAG_IDS.has(t))) {
    snippets.push(
      "Tone bias (table tags): let outcomes echo—show costs and follow-through when stakes are present; do not invent extra mechanical punishment beyond what rules already resolved.",
    );
  }
  if (normalized.has(COMEDY_TAG_ID)) {
    snippets.push(
      "Tone bias (table tags): comic timing is welcome when it fits; keep humor grounded in character.",
    );
  }
  if (snippets.length === 0) return "";
  return ` ${snippets.join(" ")}`;
}

/** First line(s) of narrator / worker system prompts: genre follows the table, not a hardcoded default. */
export function buildFacilitatorRoleLine(row: SessionNarrativeFields): string {
  const bias = buildToneBiasFromAdventureTags(row.adventure_tags);
  if (row.campaign_mode === "module" && isPlayRomanaModuleKey(row.module_key)) {
    const base = `You are the facilitator for a PlayRomana tabletop session (Ancient Rome curated season). Honor the module tone; avoid modern slang unless the table explicitly breaks frame.`;
    return `${base}${bias}`;
  }
  const hints =
    row.adventure_tags && row.adventure_tags.length > 0
      ? ` Optional tone hints from the table: ${row.adventure_tags.join(", ")}.`
      : "";
  return `You are the facilitator for a collaborative tabletop RPG. Genre, tone, and setting follow the table's premise and world context—there is no fixed genre default.${hints}${bias}`;
}

/** Merges art direction with PlayRomana visual bible when applicable. Used for image pipelines. */
export function buildStyleHintForSession(row: SessionNarrativeFields): string {
  const parts: string[] = [];
  if (row.art_direction?.trim()) parts.push(row.art_direction.trim());
  if (row.campaign_mode === "module" && isPlayRomanaModuleKey(row.module_key)) {
    const v = ROMA_SEEDS[row.module_key].visualBibleSeed;
    parts.push(`${v.palette}. Motifs: ${v.motifs}. Architecture: ${v.architecture}.`);
  }
  return parts.filter(Boolean).join(" ");
}

/** OpenRouter image API: session-aware system line (not hardcoded dark fantasy). */
export function buildOpenRouterSceneSystemPrompt(row: SessionNarrativeFields): string {
  const hint = buildStyleHintForSession(row);
  const base =
    "You are a scene illustrator. Generate a single wide cinematic image that matches the described genre and setting. Keep designs consistent with the prompt. No text, no UI, no watermarks.";
  return hint ? `${base} Style direction: ${hint}` : base;
}

export function buildOpenRouterPortraitSystemPrompt(row: SessionNarrativeFields): string {
  const hint = buildStyleHintForSession(row);
  const base =
    "You are a character portrait illustrator. Generate a single square chest-up portrait matching the described character and genre. No text, no UI, no watermarks. Clean readable composition for mobile.";
  return hint ? `${base} Style direction: ${hint}` : base;
}
