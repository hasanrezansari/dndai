"use client";

import type { NpcCombatantView } from "@/lib/state/game-store";

function isNpcAlive(status: string): boolean {
  return status.trim().toLowerCase() === "alive";
}

export interface EnemyDetailPanelProps {
  npc: NpcCombatantView;
}

export function EnemyDetailPanel({ npc }: EnemyDetailPanelProps) {
  const alive = isNpcAlive(npc.status);
  const revealPartial = npc.revealLevel === "partial" || npc.revealLevel === "full";
  const revealFull = npc.revealLevel === "full";
  const hpLine =
    revealFull && npc.hp !== undefined && npc.maxHp !== undefined
      ? `${npc.hp} / ${npc.maxHp}`
      : revealFull && npc.hp !== undefined
        ? String(npc.hp)
        : null;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-start gap-4 border-b border-[rgba(77,70,53,0.15)] pb-4">
        <div
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-avatar)] border-2 text-xl font-black ${
            alive
              ? "border-[color-mix(in_srgb,var(--atmosphere-combat)_45%,transparent)] bg-[var(--surface-high)] text-[var(--color-silver-muted)]"
              : "border-[var(--outline-variant)]/40 bg-[var(--color-deep-void)] text-[var(--outline)] opacity-70"
          }`}
          aria-hidden
        >
          {npc.portraitStatus === "ready" && npc.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={npc.portraitUrl}
              alt={`${npc.name} portrait`}
              className="h-full w-full rounded-[var(--radius-avatar)] object-cover"
            />
          ) : (
            <span className="grayscale opacity-70">
              {npc.name.trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-fantasy text-xl font-black tracking-tight text-[var(--color-silver-muted)]">
            {npc.name}
          </h3>
          <p className="mt-1 text-xs capitalize text-[var(--outline)]">
            {npc.role}
            <span className="text-[var(--outline)]/50"> · </span>
            {npc.attitude}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span
              className={`rounded-[var(--radius-pill)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] ${
                alive
                  ? "border border-[var(--color-success)]/35 bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]"
                  : "border border-[var(--outline)]/25 bg-[var(--surface-container)] text-[var(--outline)]"
              }`}
            >
              {npc.status}
            </span>
            {revealFull && npc.ac !== undefined ? (
              <span className="rounded-[var(--radius-pill)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--outline)]">
                AC {npc.ac}
              </span>
            ) : null}
            {!revealFull ? (
              <span className="rounded-[var(--radius-pill)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--outline)]">
                Intel: {revealPartial ? "partial" : "unknown"}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]">
          Whereabouts
        </p>
        <p className="text-sm text-[var(--color-silver-dim)]">{npc.location}</p>
      </div>

      {hpLine ? (
        <div>
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]">
            Vitals
          </p>
          <p className="text-data text-lg font-bold tabular-nums text-[var(--color-silver-muted)]">
            {hpLine} HP
          </p>
        </div>
      ) : null}

      {revealPartial && !revealFull ? (
        <div>
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]">
            Vitals
          </p>
          <p className="text-sm text-[var(--color-silver-dim)]">
            You have partial combat intel. Use an inspect/scout action to reveal full stats.
          </p>
        </div>
      ) : null}

      {revealFull && npc.attacks ? (
        <div>
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]">
            Attacks / kit
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-silver-dim)]">
            {npc.attacks}
          </p>
        </div>
      ) : null}

      {revealFull && npc.weakPoints && npc.weakPoints.length > 0 ? (
        <div>
          <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]">
            Weak points
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-silver-dim)]">
            {npc.weakPoints.join(", ")}
          </p>
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-support)]">
          Notes
        </p>
        <p className="text-sm leading-relaxed text-[var(--color-silver-dim)]">
          {npc.notes.trim() || "No extra notes on this foe."}
        </p>
      </div>
    </div>
  );
}
