import { COPY } from "@/lib/copy/ashveil";
import type { FeedEntry } from "@/lib/state/game-store";

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
