"use client";

import { useMemo } from "react";

import { CLASSES } from "@/lib/rules/character";
import type { CharacterStats } from "@/lib/schemas/domain";
import { useGameStore } from "@/lib/state/game-store";

const STAT_KEYS: { key: keyof CharacterStats; label: string; icon: string }[] = [
  { key: "str", label: "STR", icon: "fitness_center" },
  { key: "dex", label: "DEX", icon: "speed" },
  { key: "con", label: "CON", icon: "shield" },
  { key: "int", label: "INT", icon: "psychology" },
  { key: "wis", label: "WIS", icon: "visibility" },
  { key: "cha", label: "CHA", icon: "record_voice_over" },
];

function normClass(c: string) {
  return c.trim().toLowerCase();
}

function classIcon(characterClass: string) {
  const row = CLASSES.find((x) => x.value === normClass(characterClass));
  return row?.icon ?? "⚔";
}

function modifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatMod(m: number) {
  return m >= 0 ? `+${m}` : `${m}`;
}

function statTone(score: number) {
  if (score >= 16) return "text-[var(--color-gold-rare)]";
  if (score <= 8) return "text-[var(--color-failure)]";
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

export interface CharacterSheetProps {
  /** When set, show this party member&apos;s character instead of the current user&apos;s seat. */
  viewPlayerId?: string | null;
}

export function CharacterSheet({ viewPlayerId = null }: CharacterSheetProps) {
  const currentPlayerId = useGameStore((s) => s.currentPlayerId);
  const players = useGameStore((s) => s.players);

  const effectivePlayerId = viewPlayerId ?? currentPlayerId;

  const character = useMemo(() => {
    if (!effectivePlayerId) return null;
    const p = players.find((x) => x.id === effectivePlayerId);
    return p?.character ?? null;
  }, [effectivePlayerId, players]);

  if (!character) {
    return (
      <p className="text-center text-sm text-[var(--outline)]">
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
    <div className="flex flex-col gap-6 pb-6">
      {/* Hero Header */}
      <div className="flex items-start gap-5">
        <div className="w-20 h-20 rounded-[var(--radius-avatar)] bg-[var(--surface-high)] border-2 border-[var(--outline-variant)]/30 flex items-center justify-center shrink-0">
          {character.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.portraitUrl}
              alt={`${character.name} portrait`}
              className="h-full w-full rounded-[var(--radius-avatar)] object-cover"
            />
          ) : (
            <span className="text-4xl select-none" aria-hidden>
              {classIcon(character.mechanicalClass)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-fantasy text-2xl font-black tracking-tight text-[var(--color-silver-muted)]">
            {character.name}
          </h3>
          <p className="mt-1 text-xs text-[var(--outline)] capitalize">
            {character.displayClass} · {character.race}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span className="bg-[var(--color-gold-rare)]/10 text-[var(--color-gold-rare)] text-[9px] font-black px-2 py-0.5 border border-[var(--color-gold-rare)]/30 rounded-sm tracking-[0.15em] uppercase">
              Lvl {character.level}
            </span>
            <span className="bg-[var(--surface-high)] text-[var(--outline)] text-[9px] font-black px-2 py-0.5 border border-[var(--border-ui)] rounded-sm tracking-[0.15em] uppercase flex items-center gap-1">
              <span className="material-symbols-outlined text-[10px]">shield</span>
              AC {character.ac}
            </span>
          </div>
        </div>
      </div>

      {/* Resource Bars */}
      <div className="space-y-3 bg-[var(--surface-container)] rounded-[var(--radius-card)] p-4 border border-[var(--border-ui)]">
        <div>
          <div className="mb-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wider">
            <span className="text-[var(--outline)] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-[var(--color-failure)]">favorite</span>
              Hit Points
            </span>
            <span className="tabular-nums font-mono text-[var(--color-silver-muted)]">
              {character.hp} / {character.maxHp}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-[var(--color-deep-void)]">
            <div
              className="gradient-hp h-full rounded-sm transition-[width] duration-300"
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-[10px] font-bold uppercase tracking-wider">
            <span className="text-[var(--outline)] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-xs text-[var(--color-gold-rare)]">bolt</span>
              Mana
            </span>
            <span className="tabular-nums font-mono text-[var(--color-silver-muted)]">
              {character.mana} / {character.maxMana}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-[var(--color-deep-void)]">
            <div
              className="gradient-mana h-full rounded-sm transition-[width] duration-300"
              style={{ width: `${manaPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ability Scores */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-4 bg-[var(--color-gold-rare)]" />
          <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Ability Scores
          </h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {STAT_KEYS.map(({ key, label, icon }) => {
            const v = character.stats[key];
            const m = modifier(v);
            return (
              <div
                key={key}
                className={`flex flex-col items-center gap-1 py-3 rounded-[var(--radius-card)] border transition-colors ${
                  v >= 16
                    ? "bg-[var(--surface-high)] border-[var(--color-gold-rare)]/20"
                    : "bg-[var(--color-midnight)] border-[var(--border-ui)]"
                }`}
              >
                <span className="material-symbols-outlined text-[var(--outline)] text-sm">
                  {icon}
                </span>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                  {label}
                </span>
                <span
                  className={`text-2xl font-black tabular-nums font-mono ${statTone(v)}`}
                >
                  {v}
                </span>
                <span className="text-[10px] font-bold tabular-nums font-mono text-[var(--outline)]">
                  ({formatMod(m)})
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conditions */}
      {character.conditions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-4 bg-[var(--color-failure)]" />
            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
              Conditions
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {character.conditions.map((c) => (
              <span
                key={c}
                className="rounded-[var(--radius-pill)] bg-[var(--color-failure)]/10 border border-[var(--color-failure)]/20 px-3 py-1.5 text-xs font-bold text-[var(--color-failure)]"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Equipment */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-4 bg-[var(--color-gold-rare)]" />
          <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Equipment
          </h4>
        </div>
        {character.inventory.length === 0 ? (
          <p className="text-sm text-[var(--outline)]">
            Nothing equipped.
          </p>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-[var(--border-ui)] divide-y divide-[var(--border-divide)] overflow-hidden">
            {character.inventory.map((row, i) => (
              <div
                key={`${itemLabel(row)}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--color-midnight)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined text-[var(--outline)] text-lg">
                    {typeof row.type === "string" && row.type === "weapon"
                      ? "swords"
                      : typeof row.type === "string" && row.type === "armor"
                        ? "shield"
                        : "deployed_code"}
                  </span>
                  <span className="text-sm text-[var(--color-silver-muted)] truncate">
                    {itemLabel(row)}
                  </span>
                </div>
                {typeof row.type === "string" && (
                  <span className="text-[9px] font-black uppercase tracking-wider text-[var(--outline)] shrink-0">
                    {row.type}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abilities */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1 h-4 bg-[var(--atmosphere-mystery)]" />
          <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Abilities
          </h4>
        </div>
        {character.abilities.length === 0 ? (
          <p className="text-sm text-[var(--outline)]">
            No abilities listed.
          </p>
        ) : (
          <div className="space-y-2">
            {character.abilities.map((row, i) => (
              <div
                key={`${abilityName(row)}-${i}`}
                className="rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--color-midnight)] px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--atmosphere-mystery)] text-sm">
                    auto_awesome
                  </span>
                  <p className="text-sm font-bold text-[var(--color-silver-muted)]">
                    {abilityName(row)}
                  </p>
                </div>
                {abilityBody(row) && (
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--outline)]">
                    {abilityBody(row)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
