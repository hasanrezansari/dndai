import type { OrchestrationStepResult } from "@/lib/ai/types";
import {
  VisualDeltaOutputSchema,
  type VisualDeltaOutput,
} from "@/lib/schemas/ai-io";

const LOCATION_WORDS = /\b(enter|arrive|travel|descend|ascend|emerge|cross|portal|door|gate|cave|forest|dungeon|castle|tower|village|temple|tomb|chamber|hall|throne|river|mountain|cliff|bridge)\b/i;
const DRAMATIC_WORDS = /\b(explod|collaps|transform|summon|dragon|demon|fire|flood|earthquake|lightning|storm|destroy|shatter|crumble|rise|awaken)\b/i;
const SCENE_SHIFT_WORDS = /\b(arrive at|step into|enter the|emerge from|find (themselves|yourself) in|the scene (shifts|changes)|now stands? (in|before|at))\b/i;

function extractLocationNouns(text: string): string[] {
  const pattern = /\b(cave|forest|dungeon|castle|tower|village|temple|tomb|chamber|hall|throne|river|mountain|cliff|bridge|tavern|market|cathedral|ruins|camp|shore|clearing|library|prison|crypt|garden|arena|palace|swamp|desert|canyon)\b/gi;
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

export async function checkVisualDelta(params: {
  sessionId: string;
  turnId: string;
  narrativeText: string;
  currentSceneDescription: string | null;
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
  const imageNeeded = uniqueReasons.length > 0;
  const priority = uniqueReasons.length >= 3 ? "high" : uniqueReasons.length >= 1 ? "normal" : "low";

  const data = VisualDeltaOutputSchema.parse({
    image_needed: imageNeeded,
    reasons: uniqueReasons,
    priority,
  });

  return {
    data,
    usage: { inputTokens: 0, outputTokens: 0, model: "deterministic" },
    latencyMs: Date.now() - t0,
    success: true,
  };
}
