"use client";

import { useMemo, useState } from "react";

import { filterStaleScenePendingRows } from "@/lib/feed/display-feed-filters";
import {
  filterFeedBySemantic,
  type FeedSemanticFilter,
} from "@/lib/feed/feed-semantic-filter";
import {
  groupFeedIntoSegments,
  type FeedTurnSegment,
} from "@/lib/feed/group-feed-into-segments";
import type { FeedEntry, GamePlayerView, StatEffect } from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";

import { FeedSemanticChips } from "./feed-semantic-chips";

const ROUND_DETAIL = /^Round \d+$/;

const ROLL_RESULTS = new Set([
  "success",
  "failure",
  "critical_success",
  "critical_failure",
]);

function formatSegmentTime(entries: FeedEntry[]): string {
  const last = entries[entries.length - 1];
  if (!last) return "";
  try {
    return new Date(last.timestamp).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function playerLabel(players: GamePlayerView[], playerId: string): string {
  const p = players.find((x) => x.id === playerId);
  return p?.character?.name ?? p?.displayName ?? "Hero";
}

function segmentHeading(
  segment: FeedTurnSegment,
  players: GamePlayerView[],
): string {
  if (segment.turnId == null) {
    return "Interlude";
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
  return actor ? `${roundPart} · ${actor}` : roundPart;
}

function parseDiceLine(text: string): {
  label: string;
  roll: string;
  mod: string;
  total: string;
} | null {
  const m = text.match(
    /^([^:]+):\s*(\d+)\s*\+\s*(-?\d+)\s*=\s*(\d+)\s*$/i,
  );
  if (!m) return null;
  return {
    label: m[1]!.trim(),
    roll: m[2]!,
    mod: m[3]!,
    total: m[4]!,
  };
}

function humanizeResult(r: string) {
  return r
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ChronicleDiceLine({ entry }: { entry: FeedEntry }) {
  const parsed = parseDiceLine(entry.text);
  const isFinal = entry.detail && ROLL_RESULTS.has(entry.detail);
  const line =
    parsed && isFinal
      ? `${parsed.label} → ${parsed.total} (${parsed.roll}+${parsed.mod})`
      : parsed
        ? `${parsed.label}: ${parsed.roll}+${parsed.mod}=${parsed.total}`
        : entry.text;
  const tag =
    isFinal && entry.detail ? humanizeResult(entry.detail) : null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-l-2 border-[var(--color-gold-support)]/35 py-1.5 pl-3">
      <span className="material-symbols-outlined text-[var(--color-gold-support)]/70 text-sm" aria-hidden>
        casino
      </span>
      <span className="text-data text-[13px] text-[var(--color-silver-muted)]">
        {line}
      </span>
      {tag ? (
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--outline)]">
          {tag}
        </span>
      ) : null}
    </div>
  );
}

function ChronicleStatChips({ effects }: { effects: StatEffect[] }) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-[rgba(77,70,53,0.12)] pt-3 mt-1">
      <span className="w-full text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]/75">
        Fate
      </span>
      {effects.map((e, i) => (
        <div
          key={i}
          className="rounded-md border border-[rgba(77,70,53,0.2)] bg-[var(--color-deep-void)]/40 px-2.5 py-1"
        >
          <span className="text-fantasy text-[11px] font-bold text-[var(--color-silver-muted)]">
            {e.targetName}
          </span>
          <span className="mt-0.5 block text-data text-xs text-[var(--color-silver-dim)]">
            {e.hpDelta !== 0 ? (
              <span
                className={
                  e.hpDelta > 0
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-failure)]"
                }
              >
                {e.hpDelta > 0 ? "+" : ""}
                {e.hpDelta} HP{" "}
              </span>
            ) : null}
            {e.manaDelta !== 0 ? (
              <span className="text-[var(--gradient-mana-end)]">
                {e.manaDelta > 0 ? "+" : ""}
                {e.manaDelta} MP
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChronicleEntryBlock({
  entry,
}: {
  entry: FeedEntry;
}) {
  if (entry.type === "narration") {
    const isRoundBreak =
      Boolean(entry.detail) && ROUND_DETAIL.test(entry.detail!);

    if (isRoundBreak) {
      return (
        <div className="py-2">
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--color-gold-rare)]/30 to-transparent" />
            <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.22em] text-[var(--color-gold-rare)]">
              {entry.detail}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--color-gold-rare)]/30 to-transparent" />
          </div>
          <p className="text-fantasy mt-3 text-center text-[15px] font-medium leading-relaxed text-[var(--color-silver-muted)]">
            {entry.text}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {entry.imageUrl ? (
          <div className="-mx-1 overflow-hidden rounded-md ring-1 ring-[rgba(77,70,53,0.2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.imageUrl}
              alt=""
              loading="lazy"
              className="h-auto w-full object-cover"
              style={{ aspectRatio: "16/9" }}
            />
          </div>
        ) : null}
        <p className="text-fantasy text-[17px] font-normal leading-[1.65] tracking-tight text-[var(--color-silver-muted)]">
          {entry.text}
        </p>
        {entry.detail ? (
          <p className="text-[11px] leading-relaxed text-[var(--outline)]">
            <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.18em] text-[var(--color-gold-support)]/70">
              World shifts
            </span>
            {entry.detail}
          </p>
        ) : null}
      </div>
    );
  }

  if (entry.type === "action") {
    return (
      <blockquote className="border-l-2 border-[var(--color-gold-rare)]/45 py-0.5 pl-3">
        {entry.playerName ? (
          <cite className="not-italic text-fantasy text-[12px] font-bold text-[var(--color-gold-support)]">
            {entry.playerName}
          </cite>
        ) : null}
        <p className="mt-1 text-[14px] leading-snug text-[var(--color-silver-dim)]">
          {entry.text}
        </p>
      </blockquote>
    );
  }

  if (entry.type === "dice") {
    return <ChronicleDiceLine entry={entry} />;
  }

  if (entry.type === "stat_change" && entry.statEffects?.length) {
    return <ChronicleStatChips effects={entry.statEffects} />;
  }

  if (entry.type === "state_change") {
    return (
      <p className="text-center text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]/55">
        {entry.text}
        {entry.detail ? (
          <span className="text-[var(--outline)]/40"> · {entry.detail}</span>
        ) : null}
      </p>
    );
  }

  if (entry.type === "system") {
    return (
      <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--outline)]/65">
        {entry.text}
      </p>
    );
  }

  return (
    <p className="text-[12px] text-[var(--outline)]">{entry.text}</p>
  );
}

export interface ChronicleFeedProps {
  entries: FeedEntry[];
  className?: string;
}

export function ChronicleFeed({ entries, className = "" }: ChronicleFeedProps) {
  const players = useGameStore((s) => s.players);
  const scenePending = useGameStore((s) => s.scenePending);
  const [semanticFilter, setSemanticFilter] =
    useState<FeedSemanticFilter>("all");

  const filtered = useMemo(
    () => filterStaleScenePendingRows(entries, scenePending),
    [entries, scenePending],
  );

  const semanticsFiltered = useMemo(
    () => filterFeedBySemantic(filtered, semanticFilter),
    [filtered, semanticFilter],
  );

  const segments = useMemo(
    () => groupFeedIntoSegments(semanticsFiltered),
    [semanticsFiltered],
  );

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overflow-x-hidden px-1 pb-20 scrollbar-hide ${className}`}
      role="feed"
      aria-label="Chronicle"
    >
      <FeedSemanticChips
        value={semanticFilter}
        onChange={setSemanticFilter}
        className="sticky top-0 z-[1] -mx-1 bg-[var(--color-obsidian)]/90 px-1 pb-2 pt-0 backdrop-blur-sm"
      />
      {segments.length === 0 ? (
        <p className="text-center text-sm text-[var(--color-silver-dim)]">
          {filtered.length === 0
            ? "No events yet."
            : "Nothing in this filter."}
        </p>
      ) : (
        segments.map((segment, i) => {
          const time = formatSegmentTime(segment.entries);
          return (
            <article
              key={`${segment.turnId ?? "orphan"}-${i}`}
              className="relative mx-auto w-full max-w-[min(100%,22rem)] sm:max-w-[min(100%,26rem)]"
            >
              <div
                className="rounded-[2px] px-5 py-6 sm:px-7 sm:py-8"
                style={{
                  background:
                    "linear-gradient(165deg, color-mix(in srgb, var(--surface-container) 88%, transparent) 0%, color-mix(in srgb, var(--color-deep-void) 92%, transparent) 100%)",
                  boxShadow:
                    "inset 0 0 0 1px rgba(212,175,55,0.14), 0 16px 48px rgba(0,0,0,0.45)",
                }}
              >
                <header className="mb-5 text-center">
                  <p className="text-fantasy text-[11px] font-black uppercase tracking-[0.28em] text-[var(--color-gold-rare)]">
                    {segmentHeading(segment, players)}
                  </p>
                  <div className="mx-auto mt-2 h-px w-12 bg-gradient-to-r from-transparent via-[var(--color-gold-support)]/50 to-transparent" />
                </header>

                <div className="flex flex-col gap-5">
                  {segment.entries.map((e) => (
                    <div key={e.id}>
                      <ChronicleEntryBlock entry={e} />
                    </div>
                  ))}
                </div>

                {time ? (
                  <footer className="mt-6 border-t border-[rgba(77,70,53,0.1)] pt-3 text-center">
                    <time
                      className="text-[9px] tabular-nums tracking-wider text-[var(--outline)]/45"
                      dateTime={segment.entries[segment.entries.length - 1]!.timestamp}
                    >
                      {time}
                    </time>
                  </footer>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
