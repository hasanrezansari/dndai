import { getBuildTimeBrand } from "@/lib/brand";
import { COPY } from "@/lib/copy/ashveil";

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
      <div className="relative bg-[var(--color-deep-void)] p-5 rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/20 flex items-center gap-5 shadow-xl">
        <div className="relative">
          <div className="w-16 h-16 rounded-[var(--radius-avatar)] bg-[var(--surface-high)] flex items-center justify-center border-2 border-[var(--color-gold-rare)]/40 overflow-hidden">
            <span
              className="material-symbols-outlined text-[var(--color-gold-rare)] text-3xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
          </div>
          <div className="absolute -bottom-1 -right-1 bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] text-[8px] font-black px-1.5 py-0.5 rounded-sm tracking-wider uppercase">
            SYSTEM
          </div>
        </div>
        <div>
          <h3 className="text-fantasy text-lg text-[var(--color-gold-rare)] tracking-tight leading-tight">
            {getBuildTimeBrand() === "playromana"
              ? "The Chronicler"
              : "AI narrator"}
          </h3>
          <p className="text-[var(--color-silver-dim)] text-xs italic mt-1 leading-relaxed">
            {COPY.aiDmWaiting}
          </p>
        </div>
      </div>
    );
  }

  if (isEmpty || !player) {
    return (
      <div className="border-2 border-dashed border-[var(--outline-variant)]/10 p-4 flex items-center justify-center gap-3 min-h-[72px] group cursor-default hover:bg-[var(--surface-high)] transition-colors">
        <span className="material-symbols-outlined text-[var(--outline-variant)] group-hover:text-[var(--color-gold-rare)] transition-colors">
          person_add
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-silver-dim)] group-hover:text-[var(--color-silver-muted)] transition-colors">
          {COPY.awaitingHero}
        </span>
      </div>
    );
  }

  const displayName = player.name?.trim() || "Adventurer";
  const disconnected = !player.isConnected;

  return (
    <div
      className={`p-4 flex items-center gap-4 transition-all duration-300 ${
        disconnected
          ? "bg-[var(--color-midnight)]/30 border-l-2 border-[var(--color-failure)] opacity-60"
          : player.isReady
            ? "bg-[var(--surface-high)]"
            : "bg-[var(--color-midnight)]/50 opacity-70"
      }`}
    >
      {/* Avatar placeholder */}
      <div
        className={`w-14 h-14 bg-[var(--surface-highest)] rounded-[var(--radius-avatar)] overflow-hidden border flex items-center justify-center shrink-0 ${
          disconnected
            ? "border-[var(--outline-variant)]/30 grayscale"
            : "border-[var(--outline-variant)]/30"
        }`}
      >
        <span
          className={`material-symbols-outlined text-2xl ${
            disconnected
              ? "text-[var(--outline-variant)]"
              : "text-[var(--color-silver-dim)]"
          }`}
        >
          person
        </span>
      </div>

      {/* Info */}
      <div className="flex-grow min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-fantasy text-lg truncate ${
              disconnected
                ? "text-[var(--color-failure)]/60 italic"
                : "text-[var(--color-silver-muted)]"
            }`}
          >
            {displayName}
          </span>
          {player.isHost && (
            <span className="bg-[var(--color-gold-rare)]/10 text-[var(--color-gold-rare)] text-[8px] font-black px-1.5 py-0.5 border border-[var(--color-gold-rare)]/30 rounded-sm tracking-[0.15em]">
              HOST
            </span>
          )}
          {player.isDm && (
            <span className="bg-[var(--color-gold-rare)]/10 text-[var(--color-gold-rare)] text-[8px] font-black px-1.5 py-0.5 border border-[var(--color-gold-rare)]/30 rounded-sm tracking-[0.15em]">
              DM
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          {disconnected ? (
            <>
              <span className="material-symbols-outlined text-[12px] text-[var(--color-failure)]">
                warning
              </span>
              <span className="text-[10px] font-bold text-[var(--color-failure)] uppercase tracking-[0.15em]">
                Disconnected
              </span>
            </>
          ) : player.isReady ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--color-gold-rare)] animate-pulse shadow-[0_0_8px_rgba(242,202,80,0.8)]" />
              <span className="text-[10px] font-bold text-[var(--color-gold-rare)] uppercase tracking-[0.15em]">
                Ready
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[var(--outline-variant)]" />
              <span className="text-[10px] font-bold text-[var(--color-silver-dim)] uppercase tracking-[0.15em]">
                Not Ready
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status icon */}
      {!disconnected &&
        (player.isReady ? (
          <span
            className="material-symbols-outlined text-[var(--color-gold-rare)]/40"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        ) : (
          <span className="material-symbols-outlined text-[var(--outline-variant)]">
            pending
          </span>
        ))}
    </div>
  );
}
