import type { FeedEntry } from "@/lib/state/game-store";

export type FeedSemanticFilter =
  | "all"
  | "narration"
  | "rolls"
  | "combat"
  | "system";

export const FEED_SEMANTIC_FILTERS: {
  id: FeedSemanticFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "narration", label: "Narration" },
  { id: "rolls", label: "Rolls" },
  { id: "combat", label: "Combat" },
  { id: "system", label: "System" },
];

export function feedEntryMatchesSemanticFilter(
  entry: FeedEntry,
  filter: FeedSemanticFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "narration") return entry.type === "narration";
  if (filter === "rolls") return entry.type === "dice";
  if (filter === "combat")
    return entry.type === "action" || entry.type === "stat_change";
  if (filter === "system")
    return entry.type === "system" || entry.type === "state_change";
  return true;
}

export function filterFeedBySemantic(
  entries: FeedEntry[],
  filter: FeedSemanticFilter,
): FeedEntry[] {
  if (filter === "all") return entries;
  return entries.filter((e) => feedEntryMatchesSemanticFilter(e, filter));
}
