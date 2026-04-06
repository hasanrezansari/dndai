import type { FeedEntry } from "@/lib/state/game-store";

/** Merge lazy-loaded rows (e.g. stat traces) into the hydrate feed without duplicates. */
export function mergeChronicleFeedEntries(
  base: FeedEntry[],
  extra: FeedEntry[],
): FeedEntry[] {
  const seen = new Set(base.map((e) => e.id));
  const merged = [...base];
  for (const e of extra) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      merged.push(e);
    }
  }
  return merged.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}
