"use client";

import { useMemo } from "react";

import {
  groupFeedIntoSegments,
  type FeedTurnSegment,
} from "@/lib/feed/group-feed-into-segments";
import type { FeedEntry, GamePlayerView } from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";

import { FeedEntryRow } from "./feed-entry";

function playerLabel(players: GamePlayerView[], playerId: string): string {
  const p = players.find((x) => x.id === playerId);
  return p?.character?.name ?? p?.displayName ?? "Hero";
}

function segmentHeading(
  segment: FeedTurnSegment,
  players: GamePlayerView[],
): string {
  if (segment.turnId == null) {
    return "At the table";
  }
  const firstAction = segment.entries.find((e) => e.type === "action");
  const actor =
    firstAction?.playerName ??
    (firstAction?.playerId
      ? playerLabel(players, firstAction.playerId)
      : null);
  const r =
    segment.roundNumber ??
    segment.entries.find((e) => e.roundNumber !== undefined)?.roundNumber;
  const roundPart = r != null ? `Round ${r}` : "Beat";
  return actor ? `${roundPart} · ${actor}` : `${roundPart}`;
}

export interface ChronicleFeedProps {
  entries: FeedEntry[];
  className?: string;
}

export function ChronicleFeed({ entries, className = "" }: ChronicleFeedProps) {
  const players = useGameStore((s) => s.players);
  const segments = useMemo(
    () => groupFeedIntoSegments(entries),
    [entries],
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-16 scrollbar-hide ${className}`}
      role="feed"
      aria-label="Chronicle"
    >
      {segments.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-silver-dim)]">
          No events yet.
        </p>
      ) : (
        segments.map((segment, i) => (
          <article
            key={`${segment.turnId ?? "orphan"}-${i}`}
            className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.22)] bg-[var(--surface-container)]/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <header className="mb-3 flex items-center gap-2 border-b border-[rgba(77,70,53,0.12)] pb-2">
              <span
                className="material-symbols-outlined text-[var(--color-gold-support)] text-base"
                aria-hidden
              >
                auto_stories
              </span>
              <h3 className="text-fantasy min-w-0 flex-1 text-xs font-black tracking-tight text-[var(--color-silver-muted)]">
                {segmentHeading(segment, players)}
              </h3>
            </header>
            <div className="flex flex-col gap-3">
              {segment.entries.map((e: FeedEntry) => (
                <FeedEntryRow key={e.id} entry={e} />
              ))}
            </div>
          </article>
        ))
      )}
    </div>
  );
}
