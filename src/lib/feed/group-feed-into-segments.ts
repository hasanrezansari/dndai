import type { FeedEntry } from "@/lib/state/game-store";

export type FeedTurnSegment = {
  turnId: string | null;
  roundNumber?: number;
  entries: FeedEntry[];
};

/**
 * Server/client timing often leaves `state_change` rows without `turnId` while
 * narration still has one — that used to spawn a second Chronicle card. Merge
 * those noise rows into the previous beat when turn IDs are not in conflict.
 */
function shouldCoalesceStateChangeIntoPrevious(
  prev: FeedTurnSegment,
  entry: FeedEntry,
): boolean {
  if (entry.type !== "state_change") return false;
  const a = prev.turnId ?? null;
  const b = entry.turnId ?? null;
  const rPrev = prev.roundNumber;
  const rEntry = entry.roundNumber;
  const sameRound =
    rPrev === undefined ||
    rEntry === undefined ||
    rPrev === rEntry;
  if (!sameRound) return false;
  if (a === null || b === null) return true;
  return a === b;
}

/** Group consecutive rows that share the same `turnId` (including `null`). */
export function groupFeedIntoSegments(feed: FeedEntry[]): FeedTurnSegment[] {
  const out: FeedTurnSegment[] = [];
  for (const entry of feed) {
    const tid = entry.turnId ?? null;
    const prev = out[out.length - 1];
    const sameTurn = Boolean(prev && prev.turnId === tid);
    const coalesceState =
      Boolean(prev) &&
      !sameTurn &&
      shouldCoalesceStateChangeIntoPrevious(prev!, entry);

    if (prev && (sameTurn || coalesceState)) {
      prev.entries.push(entry);
      if (entry.roundNumber !== undefined) prev.roundNumber = entry.roundNumber;
      if (coalesceState && tid != null && prev.turnId == null) {
        prev.turnId = tid;
      }
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
