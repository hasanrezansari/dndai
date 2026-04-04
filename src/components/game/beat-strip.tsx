"use client";

import { useMemo } from "react";

import type { FeedEntry } from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";

function lastEntryOfType(
  feed: FeedEntry[],
  type: FeedEntry["type"],
): FeedEntry | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i]!;
    if (e.type === type) return e;
  }
  return null;
}

/** Prefer resolved roll line (`D20: … = total`) over rolling placeholder. */
function lastDiceDisplayEntry(feed: FeedEntry[]): FeedEntry | null {
  for (let i = feed.length - 1; i >= 0; i--) {
    const e = feed[i]!;
    if (e.type === "dice" && e.text.includes("=")) return e;
  }
  return lastEntryOfType(feed, "dice");
}

function formatDiceResultLabel(detail: string | undefined): string | null {
  if (!detail) return null;
  const map: Record<string, string> = {
    critical_success: "Critical success",
    critical_failure: "Critical failure",
    success: "Success",
    failure: "Failure",
  };
  return map[detail] ?? detail.replace(/_/g, " ");
}

export function BeatStrip() {
  const feed = useGameStore((s) => s.feed);
  const session = useGameStore((s) => s.session);
  const players = useGameStore((s) => s.players);
  const diceOverlay = useGameStore((s) => s.diceOverlay);

  const activeName = useMemo(() => {
    const id = session?.currentPlayerId;
    if (!id) return null;
    const p = players.find((x) => x.id === id);
    return p?.character?.name ?? p?.displayName ?? null;
  }, [session?.currentPlayerId, players]);

  const { actionLine, diceLine, diceStatus, statLine } = useMemo(() => {
    const action = lastEntryOfType(feed, "action");
    const diceFromFeed = lastDiceDisplayEntry(feed);
    const stat = lastEntryOfType(feed, "stat_change");

    if (diceOverlay) {
      const line = `${diceOverlay.diceType.toUpperCase()}: ${diceOverlay.rollValue} + ${diceOverlay.modifier} = ${diceOverlay.total}`;
      return {
        actionLine: action,
        diceLine: line,
        diceStatus: formatDiceResultLabel(diceOverlay.result),
        statLine: stat,
      };
    }

    return {
      actionLine: action,
      diceLine: diceFromFeed?.text ?? null,
      diceStatus: formatDiceResultLabel(diceFromFeed?.detail),
      statLine: stat,
    };
  }, [feed, diceOverlay]);

  const lastSync = useMemo(() => {
    for (let i = feed.length - 1; i >= 0; i--) {
      const e = feed[i]!;
      if (e.type === "state_change") return e;
    }
    return null;
  }, [feed]);

  const hasAny =
    activeName ||
    actionLine ||
    diceLine ||
    statLine;

  return (
    <section
      className="shrink-0 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/45 px-3 py-2.5"
      aria-label="Current beat"
    >
      <div className="mb-2 flex items-center gap-2 border-b border-[var(--border-divide)] pb-2">
        <span
          className="material-symbols-outlined text-[var(--color-gold-support)] text-base"
          aria-hidden
        >
          theater_comedy
        </span>
        <h3 className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--outline)]">
          Current beat
        </h3>
      </div>

      {!hasAny ? (
        <p className="text-center text-xs text-[var(--color-silver-dim)] py-1">
          Awaiting the table…
        </p>
      ) : (
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
              Whose turn
            </dt>
            <dd className="text-fantasy text-[var(--color-silver-muted)] line-clamp-2">
              {activeName ?? (
                <span className="text-[var(--color-silver-dim)] not-italic">
                  Turn not assigned
                </span>
              )}
            </dd>
          </div>
          {actionLine ? (
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
                Last intent
              </dt>
              <dd className="text-[var(--color-silver-muted)] line-clamp-2 text-[13px] leading-snug">
                {actionLine.playerName ? (
                  <span className="text-[var(--color-gold-support)]">
                    {actionLine.playerName}:{" "}
                  </span>
                ) : null}
                {actionLine.text}
              </dd>
            </div>
          ) : null}
          {diceLine ? (
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
                Dice
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-data text-[var(--color-silver-muted)]">
                  {diceLine}
                </span>
                {diceStatus ? (
                  <span
                    className="text-[10px] font-semibold text-[var(--color-silver-dim)]"
                    title={diceStatus}
                  >
                    ({diceStatus})
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {statLine ? (
            <div>
              <dt className="text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
                Fate
              </dt>
              <dd className="text-[var(--color-silver-muted)] line-clamp-1 text-[12px]">
                {statLine.text}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
      {session ? (
        <p className="mt-2 border-t border-[var(--border-divide)] pt-2 text-[8px] uppercase tracking-[0.1em] text-[var(--outline)]/35">
          Round {session.currentRound}
          {lastSync
            ? ` · ${lastSync.text}${lastSync.detail ? ` (${lastSync.detail})` : ""}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
