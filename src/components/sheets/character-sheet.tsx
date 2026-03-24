"use client";

import { useMemo } from "react";

import { GlassCard } from "@/components/ui/glass-card";
import { CLASSES } from "@/lib/rules/character";
import type { CharacterStats } from "@/lib/schemas/domain";
import { useGameStore } from "@/lib/state/game-store";

const STAT_KEYS: { key: keyof CharacterStats; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

function normClass(c: string) {
  return c.trim().toLowerCase();
}

function classGlyph(characterClass: string) {
  const row = CLASSES.find((x) => x.value === normClass(characterClass));
  return row?.label.charAt(0).toUpperCase() ?? "?";
}

function modifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatMod(m: number) {
  return m >= 0 ? `+${m}` : `${m}`;
}

function statTone(score: number) {
  if (score >= 16) return "text-[var(--color-gold-rare)]";
  if (score <= 8) return "text-[var(--gradient-hp-end)]";
  return "text-[var(--color-silver-muted)]";
}

function itemLabel(row: Record<string, unknown>) {
  const n = row.name;
  return typeof n === "string" && n.trim() ? n.trim() : "Item";
}

function abilityName(row: Record<string, unknown>) {
  const n = row.name;
  return typeof n === "string" && n.trim() ? n.trim() : "Ability";
}

function abilityBody(row: Record<string, unknown>) {
  const d = row.description;
  return typeof d === "string" && d.trim() ? d.trim() : "";
}

export function CharacterSheet() {
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const players = useGameStore((s) => s.players);

  const character = useMemo(() => {
    if (!currentPlayerId) return null;
    const p = players.find((x) => x.id === currentPlayerId);
    return p?.character ?? null;
  }, [currentPlayerId, players]);

  if (!character) {
    return (
      <p className="text-center text-sm text-[var(--color-silver-dim)]">
        No character linked to this seat.
      </p>
    );
  }

  const hpPct =
    character.maxHp > 0
      ? Math.min(100, Math.round((character.hp / character.maxHp) * 100))
      : 0;
  const manaPct =
    character.maxMana > 0
      ? Math.min(100, Math.round((character.mana / character.maxMana) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-[var(--void-gap)] pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-fantasy text-2xl font-normal tracking-wide text-[var(--color-silver-muted)]">
            {character.name}
          </h3>
          <p className="mt-1 text-sm capitalize text-[var(--color-silver-dim)]">
            {character.class} · {character.race} · Level {character.level}
          </p>
        </div>
        <div
          className="relative flex h-[88px] w-[72px] shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-white/[0.08] bg-[var(--color-deep-void)]/80"
          aria-hidden
        >
          <span className="text-fantasy text-3xl text-[var(--color-gold-support)]">
            {classGlyph(character.class)}
          </span>
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className="relative flex h-[4.5rem] w-[3.75rem] items-center justify-center bg-[var(--color-midnight)]/90"
          style={{
            clipPath:
              "polygon(50% 0%, 100% 18%, 100% 72%, 50% 100%, 0% 72%, 0% 18%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-[2px] bg-[var(--color-deep-void)]/95"
            style={{
              clipPath:
                "polygon(50% 0%, 100% 18%, 100% 72%, 50% 100%, 0% 72%, 0% 18%)",
            }}
          />
          <div className="relative z-[1] text-center">
            <span className="text-data block text-[10px] uppercase tracking-wider text-[var(--color-silver-dim)]">
              AC
            </span>
            <span className="text-data text-2xl font-semibold tabular-nums text-[var(--color-silver-muted)]">
              {character.ac}
            </span>
          </div>
        </div>
      </div>

      <GlassCard className="p-4">
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          {STAT_KEYS.map(({ key, label }) => {
            const v = character.stats[key];
            const m = modifier(v);
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-1 text-center"
              >
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-silver-dim)]">
                  {label}
                </span>
                <span
                  className={`text-data text-2xl font-semibold tabular-nums ${statTone(v)}`}
                >
                  {v}
                </span>
                <span className="text-data text-sm tabular-nums text-[var(--color-silver-dim)]">
                  ({formatMod(m)})
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="space-y-3 p-4">
        <div>
          <div className="mb-1.5 flex justify-between text-data text-xs text-[var(--color-silver-dim)]">
            <span>Hit points</span>
            <span className="tabular-nums text-[var(--color-silver-muted)]">
              {character.hp} / {character.maxHp}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="gradient-hp h-full rounded-full transition-[width] duration-[var(--duration-med)]"
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-data text-xs text-[var(--color-silver-dim)]">
            <span>Mana</span>
            <span className="tabular-nums text-[var(--color-silver-muted)]">
              {character.mana} / {character.maxMana}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-black/40">
            <div
              className="gradient-mana h-full rounded-full transition-[width] duration-[var(--duration-med)]"
              style={{ width: `${manaPct}%` }}
            />
          </div>
        </div>
      </GlassCard>

      {character.conditions.length > 0 && (
        <GlassCard className="p-4">
          <p className="text-fantasy mb-2 text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
            Conditions
          </p>
          <div className="flex flex-wrap gap-2">
            {character.conditions.map((c) => (
              <span
                key={c}
                className="rounded-[var(--radius-chip)] border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-[var(--color-silver-muted)]"
              >
                {c}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <p className="text-fantasy mb-3 text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
          Equipment
        </p>
        {character.inventory.length === 0 ? (
          <p className="text-sm text-[var(--color-silver-dim)]">
            Nothing equipped.
          </p>
        ) : (
          <ul className="space-y-2">
            {character.inventory.map((row, i) => (
              <li
                key={`${itemLabel(row)}-${i}`}
                className="flex items-center justify-between gap-2 border-b border-white/[0.05] pb-2 text-sm last:border-0 last:pb-0"
              >
                <span className="text-[var(--color-silver-muted)]">
                  {itemLabel(row)}
                </span>
                {typeof row.type === "string" && (
                  <span className="text-data text-xs capitalize text-[var(--color-silver-dim)]">
                    {row.type}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <p className="text-fantasy mb-3 text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
          Abilities
        </p>
        {character.abilities.length === 0 ? (
          <p className="text-sm text-[var(--color-silver-dim)]">
            No abilities listed.
          </p>
        ) : (
          <ul className="space-y-3">
            {character.abilities.map((row, i) => (
              <li
                key={`${abilityName(row)}-${i}`}
                className="rounded-[var(--radius-chip)] border border-white/[0.06] bg-[var(--color-deep-void)]/30 px-3 py-2.5"
              >
                <p className="text-sm font-medium text-[var(--color-silver-muted)]">
                  {abilityName(row)}
                </p>
                {abilityBody(row) && (
                  <p className="mt-1 text-sm leading-snug text-[var(--color-silver-dim)]">
                    {abilityBody(row)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
