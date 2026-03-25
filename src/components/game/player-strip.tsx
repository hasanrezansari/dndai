"use client";

import { useGameStore } from "@/lib/state/game-store";
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
  const hpFlash = useGameStore((s) => s.hpFlash);

  return (
    <div className="h-[6rem] shrink-0">
      <div className="scrollbar-hide flex h-full gap-4 overflow-x-auto pb-1 pt-1">
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
          const flash = hpFlash[p.id];

          return (
            <div
              key={p.id}
              className={`flex w-14 shrink-0 flex-col items-center gap-1.5 transition-opacity ${dim ? "opacity-30" : ""}`}
              title={displayName}
            >
              <div
                className={`relative flex h-12 w-12 items-center justify-center rounded-[var(--radius-avatar)] text-sm font-black transition-all ${
                  active
                    ? "selected-glow bg-[var(--surface-high)] text-[var(--color-gold-rare)] border-2 border-[var(--color-gold-rare)]"
                    : "bg-[var(--color-midnight)] text-[var(--color-silver-dim)] border border-[rgba(77,70,53,0.2)]"
                } ${flash === "damage" ? "animate-hp-flash-damage" : flash === "heal" ? "animate-hp-flash-heal" : ""}`}
              >
                {p.isConnected ? avatarLetter(p) : "…"}
              </div>
              <div
                className={`h-1.5 w-full max-w-[2.75rem] overflow-hidden rounded-sm bg-[var(--color-deep-void)] ${
                  flash ? "ring-1 ring-offset-1 ring-offset-transparent" : ""
                } ${flash === "damage" ? "ring-red-500/60" : flash === "heal" ? "ring-emerald-500/60" : ""}`}
                aria-hidden
              >
                <div
                  className="gradient-hp h-full min-w-0 rounded-sm transition-[width] duration-300"
                  style={{ width: `${hpPct}%` }}
                />
              </div>
              <p
                className={`line-clamp-1 max-w-[3.5rem] text-center text-[9px] font-bold leading-tight uppercase tracking-wider ${
                  active
                    ? "text-[var(--color-gold-rare)]"
                    : "text-[var(--outline)]"
                }`}
              >
                {displayName}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
