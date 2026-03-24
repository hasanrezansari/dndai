"use client";

import { useMemo } from "react";

import { useGameStore } from "@/lib/state/game-store";

export function PartySheet() {
  const players = useGameStore((s) => s.players);
  const currentTurnPlayerId = useGameStore(
    (s) => s.session?.currentPlayerId ?? null,
  );

  const ordered = useMemo(
    () => [...players].sort((a, b) => a.seatIndex - b.seatIndex),
    [players],
  );

  if (ordered.length === 0) {
    return (
      <p className="text-center text-sm text-[var(--color-silver-dim)]">
        No party members yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-[var(--void-gap)] pb-6">
      {ordered.map((p) => {
        const c = p.character;
        const name =
          c?.name?.trim() || `Seat ${p.seatIndex + 1}`;
        const subtitle = c
          ? `${c.class} · ${c.race}`
          : "No character";
        const hp = c?.hp ?? 0;
        const maxHp = c?.maxHp ?? 1;
        const hpPct = Math.min(100, Math.round((hp / Math.max(maxHp, 1)) * 100));
        const isTurn = currentTurnPlayerId === p.id;
        const statusLabel = !p.isConnected
          ? "Offline"
          : p.isReady
            ? "Ready"
            : "Connected";

        return (
          <li
            key={p.id}
            className={`rounded-[var(--radius-card)] border bg-[var(--color-deep-void)]/40 px-3 py-3 backdrop-blur-sm ${
              isTurn
                ? "border-[var(--color-gold-rare)]/55 shadow-[0_0_20px_rgba(212,175,55,0.12)]"
                : "border-white/[0.08]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-fantasy text-base text-[var(--color-silver-muted)]">
                  {name}
                </p>
                <p className="truncate text-xs capitalize text-[var(--color-silver-dim)]">
                  {subtitle}
                </p>
                {c && (
                  <div className="mt-2 h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-black/45">
                    <div
                      className="gradient-hp h-full rounded-full"
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`text-data rounded-[var(--radius-chip)] px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                    p.isConnected
                      ? "bg-white/[0.06] text-[var(--color-silver-muted)]"
                      : "bg-white/[0.03] text-[var(--color-silver-dim)]"
                  }`}
                >
                  {statusLabel}
                </span>
                {c && (
                  <span className="text-data text-[10px] tabular-nums text-[var(--color-silver-dim)]">
                    {hp}/{maxHp}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
