"use client";

import { useGameStore } from "@/lib/state/game-store";
import type { GamePlayerView, NpcCombatantView } from "@/lib/state/game-store";

export interface CombatStripProps {
  players: GamePlayerView[];
  npcs: NpcCombatantView[];
  currentTurnPlayerId: string | null;
  onInspectPlayer?: (playerId: string) => void;
  onInspectEnemy?: (npcId: string) => void;
}

/** Deterministic avatar when `visual_profile.portrait_url` was never set (no extra API calls from us). */
function playerPortraitSrc(p: GamePlayerView): string {
  const custom = p.character?.portraitUrl?.trim();
  if (custom) return custom;
  const displayName =
    p.character?.name?.trim() ||
    p.displayName?.trim() ||
    `seat-${p.seatIndex + 1}`;
  const seed = encodeURIComponent(displayName.slice(0, 64));
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&fontWeight=700`;
}

function avatarLetterNpc(n: NpcCombatantView) {
  const t = n.name.trim();
  if (t.length > 0) return t[0]!.toUpperCase();
  return "?";
}

function isNpcAlive(status: string): boolean {
  return status.trim().toLowerCase() === "alive";
}

export function CombatStrip({
  players,
  npcs,
  currentTurnPlayerId,
  onInspectPlayer,
  onInspectEnemy,
}: CombatStripProps) {
  const hpFlash = useGameStore((s) => s.hpFlash);

  return (
    <div className="h-[6rem] shrink-0">
      <div className="scrollbar-hide flex h-full items-end gap-3 overflow-x-auto pb-1 pt-1">
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="pl-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-[var(--outline)]">
            Party
          </span>
          <div className="flex gap-4">
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
                  {onInspectPlayer ? (
                    <button
                      type="button"
                      onClick={() => onInspectPlayer(p.id)}
                      className={`relative flex h-12 w-12 items-center justify-center rounded-[var(--radius-avatar)] text-sm font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] ${
                        active
                          ? "selected-glow border-2 border-[var(--color-gold-rare)] bg-[var(--surface-high)] text-[var(--color-gold-rare)]"
                          : "border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)] text-[var(--color-silver-dim)]"
                      } ${flash === "damage" ? "animate-hp-flash-damage" : flash === "heal" ? "animate-hp-flash-heal" : ""}`}
                      aria-label={`Open character sheet for ${displayName}`}
                    >
                      {p.isConnected ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={playerPortraitSrc(p)}
                          alt={`${displayName} portrait`}
                          className="h-full w-full rounded-[var(--radius-avatar)] object-cover"
                        />
                      ) : (
                        "…"
                      )}
                    </button>
                  ) : (
                    <div
                      className={`relative flex h-12 w-12 items-center justify-center rounded-[var(--radius-avatar)] text-sm font-black transition-all ${
                        active
                          ? "selected-glow border-2 border-[var(--color-gold-rare)] bg-[var(--surface-high)] text-[var(--color-gold-rare)]"
                          : "border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)] text-[var(--color-silver-dim)]"
                      } ${flash === "damage" ? "animate-hp-flash-damage" : flash === "heal" ? "animate-hp-flash-heal" : ""}`}
                    >
                      {p.isConnected ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={playerPortraitSrc(p)}
                          alt={`${displayName} portrait`}
                          className="h-full w-full rounded-[var(--radius-avatar)] object-cover"
                        />
                      ) : (
                        "…"
                      )}
                    </div>
                  )}
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

        {npcs.length > 0 ? (
          <>
            <div
              className="mb-2 h-10 w-px shrink-0 self-end bg-[var(--outline-variant)]/35"
              aria-hidden
            />
            <div className="flex shrink-0 flex-col gap-1.5">
              <span className="pl-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-[color-mix(in_srgb,var(--atmosphere-combat)_70%,var(--outline))]">
                Foes
              </span>
              <div className="flex gap-4">
                {npcs.map((n) => {
                  const alive = isNpcAlive(n.status);
                  const hpPct =
                    n.hp !== undefined &&
                    n.maxHp !== undefined &&
                    n.maxHp > 0
                      ? Math.min(100, Math.round((n.hp / n.maxHp) * 100))
                      : null;

                  return (
                    <div
                      key={n.id}
                      className={`flex w-14 shrink-0 flex-col items-center gap-1.5 ${alive ? "" : "opacity-40"}`}
                      title={n.name}
                    >
                      {onInspectEnemy ? (
                        <button
                          type="button"
                          onClick={() => onInspectEnemy(n.id)}
                          className="relative flex h-12 w-12 items-center justify-center rounded-[var(--radius-avatar)] border border-[color-mix(in_srgb,var(--atmosphere-combat)_40%,transparent)] bg-[var(--color-deep-void)] text-sm font-black text-[var(--color-silver-dim)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atmosphere-combat)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] hover:border-[var(--atmosphere-combat)]/55"
                          aria-label={`Open details for ${n.name}`}
                        >
                          {n.portraitStatus === "ready" && n.portraitUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={n.portraitUrl}
                              alt={`${n.name} portrait`}
                              className="h-full w-full rounded-[var(--radius-avatar)] object-cover"
                            />
                          ) : (
                            <span className="opacity-65 grayscale">
                              {avatarLetterNpc(n)}
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className="relative flex h-12 w-12 items-center justify-center rounded-[var(--radius-avatar)] border border-[color-mix(in_srgb,var(--atmosphere-combat)_40%,transparent)] bg-[var(--color-deep-void)] text-sm font-black text-[var(--color-silver-dim)]">
                          {n.portraitStatus === "ready" && n.portraitUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={n.portraitUrl}
                              alt={`${n.name} portrait`}
                              className="h-full w-full rounded-[var(--radius-avatar)] object-cover"
                            />
                          ) : (
                            <span className="opacity-65 grayscale">
                              {avatarLetterNpc(n)}
                            </span>
                          )}
                        </div>
                      )}
                      {hpPct !== null ? (
                        <div
                          className="h-1.5 w-full max-w-[2.75rem] overflow-hidden rounded-sm bg-[var(--color-deep-void)]"
                          aria-hidden
                        >
                          <div
                            className="h-full min-w-0 rounded-sm bg-gradient-to-r from-[var(--atmosphere-combat)] to-[var(--color-failure)] transition-[width] duration-300"
                            style={{ width: `${hpPct}%` }}
                          />
                        </div>
                      ) : (
                        <div
                          className="h-1.5 w-full max-w-[2.75rem] rounded-sm bg-[var(--color-deep-void)]/80"
                          aria-hidden
                        />
                      )}
                      <p className="line-clamp-1 max-w-[3.5rem] text-center text-[9px] font-bold leading-tight uppercase tracking-wider text-[var(--outline)]">
                        {n.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
