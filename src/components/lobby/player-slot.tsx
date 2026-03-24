import { COPY } from "@/lib/copy/ashveil";
import { GlassCard } from "@/components/ui/glass-card";

export interface PlayerSlotPlayer {
  id: string;
  name?: string;
  seatIndex: number;
  isReady: boolean;
  isHost: boolean;
  isDm: boolean;
  isConnected: boolean;
}

interface PlayerSlotProps {
  player?: PlayerSlotPlayer;
  isAiDm?: boolean;
  isEmpty?: boolean;
}

export function PlayerSlot({ player, isAiDm, isEmpty }: PlayerSlotProps) {
  if (isAiDm) {
    return (
      <GlassCard className="relative overflow-hidden p-4 min-h-[72px] flex flex-col justify-center">
        <div
          className="pointer-events-none absolute inset-0 animate-shimmer opacity-80"
          aria-hidden
        />
        <p className="text-fantasy text-sm tracking-wide text-[var(--color-gold-rare)] relative z-10">
          AI Dungeon Master
        </p>
        <p className="text-xs text-[var(--color-silver-dim)] mt-1 relative z-10">
          {COPY.aiDmWaiting}
        </p>
      </GlassCard>
    );
  }

  if (isEmpty || !player) {
    return (
      <GlassCard className="p-4 min-h-[72px] flex items-center justify-center opacity-45 border border-[rgba(255,255,255,0.04)]">
        <p className="text-sm text-[var(--color-silver-muted)]">{COPY.awaitingHero}</p>
      </GlassCard>
    );
  }

  const displayName = player.name?.trim() || "Adventurer";
  const readyGlow = player.isReady
    ? "glow-gold border-[rgba(212,175,55,0.35)]"
    : "opacity-80 border-[rgba(255,255,255,0.06)]";
  const disconnected = !player.isConnected;

  return (
    <GlassCard
      className={`p-4 min-h-[72px] flex flex-col gap-2 transition-opacity duration-[var(--duration-med)] ${readyGlow} ${disconnected ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-fantasy text-sm text-[var(--color-silver-muted)] tracking-wide">
            {displayName}
          </p>
          <p className="text-data text-xs text-[var(--color-silver-dim)] mt-0.5">
            Seat {player.seatIndex + 1}
            {player.isDm ? " · DM" : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {player.isHost ? (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-[var(--radius-chip)] bg-[rgba(212,175,55,0.12)] text-[var(--color-gold-support)] border border-[rgba(212,175,55,0.2)]">
              HOST
            </span>
          ) : null}
          <span
            className={`text-[10px] uppercase tracking-wider ${player.isReady ? "text-[var(--color-gold-rare)]" : "text-[var(--color-silver-dim)]"}`}
          >
            {player.isReady ? "Ready" : "Not ready"}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
