"use client";

import { useMemo } from "react";

import type { FeedEntry } from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function typeLabel(type: FeedEntry["type"]) {
  switch (type) {
    case "action":
      return "Act";
    case "dice":
      return "Dice";
    case "narration":
      return "Nar";
    case "state_change":
      return "State";
    default:
      return "Sys";
  }
}

function assignRounds(entries: FeedEntry[]): Map<number, FeedEntry[]> {
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let r = 1;
  const map = new Map<number, FeedEntry[]>();
  for (const e of sorted) {
    if (e.type === "system") {
      const m = e.text.match(/^Round (\d+)/);
      if (m) r = Number.parseInt(m[1]!, 10);
    }
    const list = map.get(r) ?? [];
    list.push(e);
    map.set(r, list);
  }
  return map;
}

export function JournalSheet() {
  const feed = useGameStore((s) => s.feed);

  const groups = useMemo(() => {
    const m = assignRounds(feed);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [feed]);

  if (groups.length === 0) {
    return (
      <p className="text-center text-sm text-[var(--color-silver-dim)]">
        No journal entries yet.
      </p>
    );
  }

  return (
    <div className="space-y-[var(--void-gap)] pb-6">
      {groups.map(([round, entries]) => (
        <section key={round}>
          <div className="sticky top-0 z-[1] -mx-1 mb-3 border-b border-white/[0.06] bg-[var(--color-obsidian)]/95 px-1 py-2 backdrop-blur-md">
            <h3 className="text-fantasy text-sm tracking-wide text-[var(--color-silver-muted)]">
              Round {round}
            </h3>
          </div>
          <ul className="space-y-3">
            {entries.map((entry) => {
              const time = formatTime(entry.timestamp);
              const who =
                entry.playerName ??
                (entry.type === "narration"
                  ? "Narrator"
                  : entry.type === "system"
                    ? "System"
                    : "—");

              return (
                <li
                  key={entry.id}
                  className="flex gap-3 border-b border-white/[0.04] pb-3 last:border-0"
                >
                  <span className="text-data mt-0.5 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-chip)] border border-white/10 bg-[var(--color-deep-void)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-silver-dim)]">
                    {typeLabel(entry.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-data text-xs text-[var(--color-silver-muted)]">
                        {who}
                      </span>
                      <time
                        className="text-data text-[10px] tabular-nums text-[var(--color-silver-dim)]"
                        dateTime={entry.timestamp}
                      >
                        {time}
                      </time>
                    </div>
                    {entry.type === "narration" ? (
                      <p className="text-fantasy text-sm italic leading-relaxed text-[var(--color-silver-muted)]">
                        {entry.text}
                      </p>
                    ) : (
                      <p className="text-sm leading-snug text-[var(--color-silver-muted)]">
                        {entry.text}
                      </p>
                    )}
                    {entry.detail && (
                      <p className="text-data mt-1 text-xs text-[var(--color-silver-dim)]">
                        {entry.detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
