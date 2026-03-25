"use client";

import type { GamePlayerView } from "@/lib/state/game-store";

export interface PlayerStripProps {
  players: GamePlayerView[];
  currentTurnPlayerId: string | null;
}

function avatarLetter(p: GamePlayerView) {
  const n = p.character?.name?.trim();
  if (n && n.length > 0) return n[0]!.toUpperCase();
  return "?";
}

export function PlayerStrip({ players, currentTurnPlayerId }: PlayerStripProps) {
  return (
    <div className="h-[5.75rem] shrink-0">
      <div className="scrollbar-hide flex h-full gap-3 overflow-x-auto pb-1 pt-1">
        {players.map((p) => {
          const active = p.id === currentTurnPlayerId;
          const hpPct =
            p.character && p.character.maxHp > 0
              ? Math.min(
                  100,
                  Math.round((p.character.hp / p.character.maxHp) * 100),
                )
              : 0;
          const displayName =
            p.character?.name?.trim() ||
            p.displayName?.trim() ||
            `Seat ${p.seatIndex + 1}`;
          const dim = !p.isConnected;

          return (
            <div
              key={p.id}
              className={`flex w-[3.35rem] shrink-0 flex-col items-center gap-1 ${dim ? "opacity-40" : ""}`}
              title={displayName}
            >
              <div
                className={`relative flex h-11 w-11 items-center justify-center rounded-full text-data text-sm font-semibold text-[var(--color-silver-muted)] ${
                  active
                    ? "animate-pulse-glow ring-2 ring-[var(--color-gold-rare)] ring-offset-2 ring-offset-[var(--color-obsidian)]"
                    : "ring-1 ring-white/10"
                }`}
                style={{ background: "var(--color-midnight)" }}
              >
                {p.isConnected ? avatarLetter(p) : "…"}
              </div>
              <div
                className="h-[3px] w-full max-w-[2.75rem] overflow-hidden rounded-full bg-[var(--color-deep-void)]"
                aria-hidden
              >
                <div
                  className="gradient-hp h-full min-w-0 rounded-full transition-[width] duration-300"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <p className="line-clamp-1 max-w-[3.35rem] text-center text-[9px] leading-tight text-[var(--color-silver-dim)]">
                {displayName}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
