import type { FeedEntry } from "@/lib/state/game-store";

export type FeedTurnSegment = {
  turnId: string | null;
  roundNumber?: number;
  entries: FeedEntry[];
};

/** Group consecutive rows that share the same `turnId` (including `null`). */
export function groupFeedIntoSegments(feed: FeedEntry[]): FeedTurnSegment[] {
  const out: FeedTurnSegment[] = [];
  for (const entry of feed) {
    const tid = entry.turnId ?? null;
    const prev = out[out.length - 1];
    if (prev && prev.turnId === tid) {
      prev.entries.push(entry);
      if (entry.roundNumber !== undefined) prev.roundNumber = entry.roundNumber;
    } else {
      out.push({
        turnId: tid,
        roundNumber: entry.roundNumber,
        entries: [entry],
      });
    }
  }
  return out;
}
