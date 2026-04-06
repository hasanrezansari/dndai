import {
  SPARK_COST_AI_TEXT_TURN,
  SPARK_COST_CAMPAIGN_SESSION_START,
  SPARK_COST_SCENE_IMAGE,
} from "@/lib/spark-pricing";

export type VisualRhythmPreset = "standard" | "cinematic";

export const CHAPTER_PRESETS: Record<
  VisualRhythmPreset,
  { chapterMaxTurns: number; chapterSystemImageBudget: number }
> = {
  standard: { chapterMaxTurns: 28, chapterSystemImageBudget: 2 },
  cinematic: { chapterMaxTurns: 42, chapterSystemImageBudget: 6 },
};

export const MANUAL_SCENE_IMAGE_COOLDOWN_SEC = 45;

export function normalizeVisualRhythmPreset(
  v: string | null | undefined,
): VisualRhythmPreset {
  return v === "cinematic" ? "cinematic" : "standard";
}

export function turnsElapsedInChapter(params: {
  currentRound: number;
  chapterStartRound: number;
}): number {
  return params.currentRound - params.chapterStartRound + 1;
}

export function isChapterTurnCapExceeded(params: {
  currentRound: number;
  chapterStartRound: number;
  chapterMaxTurns: number;
}): boolean {
  return turnsElapsedInChapter(params) > params.chapterMaxTurns;
}

/**
 * Rough host Sparks per chapter for `ai_dm` (lobby / HUD hint only).
 * Assumes one session start cost amortized into the first chapter estimate.
 */
export function estimateHostSparksPerChapter(params: {
  preset: VisualRhythmPreset;
  mode: string;
}): number {
  if (params.mode !== "ai_dm") return 0;
  const caps = CHAPTER_PRESETS[params.preset];
  const text = caps.chapterMaxTurns * SPARK_COST_AI_TEXT_TURN;
  const images = caps.chapterSystemImageBudget * SPARK_COST_SCENE_IMAGE;
  return SPARK_COST_CAMPAIGN_SESSION_START + text + images;
}
