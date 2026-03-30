import { COPY } from "@/lib/copy/ashveil";
import type { FeedEntry } from "@/lib/state/game-store";
import { isRoundRollupNarration } from "@/lib/state/game-store";

/** Hide completed scene-gen status rows once painting is no longer active (store still keeps them). */
export function filterStaleScenePendingRows(
  entries: FeedEntry[],
  scenePending: boolean,
): FeedEntry[] {
  if (scenePending) return entries;
  return entries.filter(
    (e) => !(e.type === "system" && e.text === COPY.scenePending),
  );
}

/** Chronicle view: story flow only — no state-sync lines or round-rollup narration cards. */
export function filterChronicleDisplayEntries(entries: FeedEntry[]): FeedEntry[] {
  return entries.filter(
    (e) => e.type !== "state_change" && !isRoundRollupNarration(e),
  );
}
