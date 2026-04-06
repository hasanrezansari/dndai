import type { OrchestrationStepResult } from "@/lib/ai/types";
import {
  VisualDeltaOutputSchema,
  type NarrativeBeat,
  type VisualDeltaOutput,
} from "@/lib/schemas/ai-io";

const LOCATION_WORDS =
  /\b(enter|arrive|travel|descend|ascend|emerge|cross|portal|door|gate|cave|forest|dungeon|castle|tower|village|temple|tomb|chamber|hall|throne|river|mountain|cliff|bridge|hangar|corridor|lobby|airlock|cockpit|warehouse|office|subway|alley|bunker|laboratory|studio|apartment|penthouse|cabin|deck|dock|clinic|cafeteria|runway|tarmac|elevator|sidewalk|highway)\b/i;
const DRAMATIC_WORDS =
  /\b(explod|collaps|transform|summon|dragon|demon|fire|flood|earthquake|lightning|storm|destroy|shatter|crumble|rise|awaken|detonat|meltdown|breach|meteor|asteroid|reactor|implosion|blackout|outbreak)\b/i;
const SCENE_SHIFT_WORDS =
  /\b(arrive at|step into|enter the|emerge from|find (themselves|yourself) in|the scene (shifts|changes)|now stands? (in|before|at)|pull(?:s|ed)? (in|up) to|docks? at|lands? in|materializes? in|beams? (?:down|over) to)\b/i;

function extractLocationNouns(text: string): string[] {
  const pattern =
    /\b(cave|forest|dungeon|castle|tower|village|temple|tomb|chamber|hall|throne|river|mountain|cliff|bridge|tavern|market|cathedral|ruins|camp|shore|coast|harbour|harbor|clearing|library|prison|crypt|garden|arena|palace|swamp|desert|canyon|hangar|corridor|lobby|airlock|cockpit|warehouse|office|subway|alley|bunker|laboratory|studio|apartment|penthouse|cabin|dock|clinic|cafeteria|runway|tarmac|elevator|sidewalk|highway|skyscraper|starship|shuttle|station|sea|ocean|vessel|boat|ship|deck)\b/gi;
  const matches = text.match(pattern) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))];
}

function computeLocationOverlap(
  currentLocations: string[],
  narrativeLocations: string[],
): number {
  if (currentLocations.length === 0 || narrativeLocations.length === 0) return 1;
  const shared = narrativeLocations.filter((l) => currentLocations.includes(l));
  return shared.length / narrativeLocations.length;
}

function anchorGeographyReasons(
  prior: string | null | undefined,
  next: string | null | undefined,
): string[] {
  const a = prior?.trim() ?? "";
  const b = next?.trim() ?? "";
  if (a.length < 8 || b.length < 8) return [];
  const nounsA = extractLocationNouns(a);
  const nounsB = extractLocationNouns(b);
  if (nounsA.length === 0 || nounsB.length === 0) return [];
  const overlap = computeLocationOverlap(nounsA, nounsB);
  if (overlap < 0.42) {
    return ["Situation anchor moved to a different place"];
  }
  return [];
}

function decideImageFromSignals(params: {
  heuristicReasons: string[];
  anchorReasons: string[];
  narrativeBeat: NarrativeBeat | null | undefined;
}): { image_needed: boolean; reasons: string[]; priority: VisualDeltaOutput["priority"] } {
  const beat = params.narrativeBeat;
  const merged = [...new Set([...params.heuristicReasons, ...params.anchorReasons])];

  const authorEstablishing =
    beat?.warrants_establishing_shot === true &&
    (beat.setting_change === "new_venue" || beat.setting_change === "world_shaking");

  const anchorBackedVenueShift =
    params.anchorReasons.length > 0 &&
    (beat?.setting_change === "new_venue" || beat?.setting_change === "world_shaking");

  const worldShakeWithCue =
    beat?.setting_change === "world_shaking" && params.heuristicReasons.length >= 1;

  const image_needed =
    merged.length >= 2 ||
    authorEstablishing ||
    anchorBackedVenueShift ||
    worldShakeWithCue;

  let priority: VisualDeltaOutput["priority"] = "low";
  if (authorEstablishing || worldShakeWithCue || beat?.setting_change === "world_shaking") {
    priority = "high";
  } else if (merged.length >= 3) {
    priority = "high";
  } else if (merged.length >= 1) {
    priority = "normal";
  }

  const outReasons = [...merged];
  if (authorEstablishing) {
    outReasons.push("Narrator: establishing shot warranted for this beat");
  }

  return {
    image_needed,
    reasons: [...new Set(outReasons)],
    priority,
  };
}

export async function checkVisualDelta(params: {
  sessionId: string;
  turnId: string;
  narrativeText: string;
  currentSceneDescription: string | null;
  /** Prior turn’s situation line — compared to the new anchor for geography shifts. */
  priorSituationAnchor?: string | null;
  /** This turn’s situation line (after narration). */
  newSituationAnchor?: string | null;
  /** Author pacing from the narrator — aligns limited scene art with story beats. */
  narrativeBeat?: NarrativeBeat | null;
}): Promise<OrchestrationStepResult<VisualDeltaOutput>> {
  const t0 = Date.now();
  const text = params.narrativeText;
  const reasons: string[] = [];

  if (LOCATION_WORDS.test(text)) reasons.push("Location change detected");
  if (DRAMATIC_WORDS.test(text)) reasons.push("Dramatic visual event");
  if (SCENE_SHIFT_WORDS.test(text)) reasons.push("Scene shift language detected");

  if (params.currentSceneDescription) {
    const currentLocations = extractLocationNouns(params.currentSceneDescription);
    const narrativeLocations = extractLocationNouns(text);
    const overlap = computeLocationOverlap(currentLocations, narrativeLocations);

    if (narrativeLocations.length > 0 && overlap < 0.5) {
      reasons.push("New location differs from current scene");
    }

    const currentWords = new Set(
      params.currentSceneDescription.toLowerCase().split(/\s+/).filter((w) => w.length > 4),
    );
    const narrativeWords = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const contentWords = narrativeWords.filter((w) => !currentWords.has(w));
    const noveltyRatio = narrativeWords.length > 0
      ? contentWords.length / narrativeWords.length
      : 0;

    // Short lines (greetings, small talk) have few "long" tokens, so noveltyRatio
    // often hits 1.0 vs a tiny scene summary — falsely suggesting a new image.
    const MIN_WORDS_FOR_NOVELTY_CHECK = 8;
    if (
      narrativeWords.length >= MIN_WORDS_FOR_NOVELTY_CHECK &&
      noveltyRatio > 0.7
    ) {
      reasons.push("Narrative describes substantially different visual content");
    }
  }

  const uniqueReasons = [...new Set(reasons)];
  const anchorReasons = anchorGeographyReasons(
    params.priorSituationAnchor,
    params.newSituationAnchor,
  );

  const { image_needed, reasons: allReasons, priority } = decideImageFromSignals({
    heuristicReasons: uniqueReasons,
    anchorReasons,
    narrativeBeat: params.narrativeBeat,
  });

  const data = VisualDeltaOutputSchema.parse({
    image_needed,
    reasons: allReasons,
    priority,
  });

  return {
    data,
    usage: { inputTokens: 0, outputTokens: 0, model: "deterministic" },
    latencyMs: Date.now() - t0,
    success: true,
  };
}
