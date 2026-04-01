"use client";

import type { ClassProfile } from "@/lib/schemas/domain";

export interface HeroKitPreviewProps {
  profile: ClassProfile;
  abilityBudgetCap?: number;
  gearBudgetCap?: number;
  statBiasBudgetCap?: number;
  compact?: boolean;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function budgetBar({
  label,
  value,
  cap,
}: {
  label: string;
  value: number;
  cap: number;
}) {
  const pct = cap > 0 ? clampPct((value / cap) * 100) : 0;
  const over = value > cap;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--outline)]">
          {label}
        </p>
        <p
          className={`text-[10px] font-black uppercase tracking-[0.18em] ${
            over ? "text-[var(--color-failure)]" : "text-[var(--outline)]"
          }`}
        >
          {value}/{cap}
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full border border-white/10 bg-black/20">
        <div
          className={`h-full ${over ? "bg-[var(--color-failure)]" : "bg-[var(--color-gold-rare)]/70"}`}
          style={{ width: `${Math.max(2, Math.round(pct))}%` }}
        />
      </div>
    </div>
  );
}

function gearIcon(type: ClassProfile["starting_gear"][number]["type"]): string {
  switch (type) {
    case "weapon":
      return "swords";
    case "armor":
      return "shield";
    case "focus":
      return "auto_fix_high";
    case "tool":
      return "deployed_code";
    case "cyberware":
      return "memory";
    default:
      return "inventory_2";
  }
}

export function HeroKitPreview({
  profile,
  abilityBudgetCap = 10,
  gearBudgetCap = 7,
  statBiasBudgetCap = 5,
  compact = false,
}: HeroKitPreviewProps) {
  const abilityBudget =
    profile.abilities.reduce((sum, a) => sum + (a.power_cost ?? 0), 0) ?? 0;
  const gearBudget =
    profile.starting_gear.reduce((sum, g) => sum + (g.power_cost ?? 0), 0) ?? 0;
  const statBiasBudget =
    Object.values(profile.stat_bias).reduce((sum, n) => sum + Math.max(0, n), 0) ??
    0;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="w-1 h-5 bg-[var(--color-gold-rare)] mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--outline)]">
            Class kit
          </p>
          <p className="mt-1 text-fantasy text-lg text-[var(--color-silver-muted)] truncate">
            {profile.display_name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--color-gold-rare)] border border-[rgba(212,175,55,0.25)] rounded-[var(--radius-chip)] px-2 py-1 bg-[var(--surface-high)]/20">
              {profile.combat_role}
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--outline)] border border-white/10 rounded-[var(--radius-chip)] px-2 py-1 bg-black/15">
              {profile.source}
            </span>
          </div>
          {profile.fantasy?.trim() ? (
            <p className="mt-2 text-sm text-[var(--color-silver-dim)] italic leading-relaxed">
              {profile.fantasy.trim()}
            </p>
          ) : null}
        </div>
      </div>

      {!compact ? (
        <div className="space-y-3">
          {budgetBar({
            label: "Ability Budget",
            value: abilityBudget,
            cap: abilityBudgetCap,
          })}
          {budgetBar({ label: "Gear Budget", value: gearBudget, cap: gearBudgetCap })}
          {budgetBar({
            label: "Stat Bias Budget",
            value: statBiasBudget,
            cap: statBiasBudgetCap,
          })}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Abilities
          </h3>
        </div>
        <div className="space-y-2">
          {profile.abilities.slice(0, 8).map((a, idx) => (
            <div
              key={`${a.name}-${idx}`}
              className="rounded-[var(--radius-card)] border border-white/10 bg-black/15 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-[var(--color-silver-muted)]">{a.name}</p>
                <div className="flex items-center gap-1.5">
                  {a.resource_cost ? (
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--outline)] border border-white/10 rounded-[var(--radius-chip)] px-2 py-1 bg-black/20">
                      {a.resource_cost} MP
                    </span>
                  ) : null}
                  {a.cooldown ? (
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--outline)] border border-white/10 rounded-[var(--radius-chip)] px-2 py-1 bg-black/20">
                      CD {a.cooldown}
                    </span>
                  ) : null}
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--outline)] border border-white/10 rounded-[var(--radius-chip)] px-2 py-1 bg-black/20">
                    {a.power_cost}
                  </span>
                </div>
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                {a.type} · {a.effect_kind}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Starting gear
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {profile.starting_gear.slice(0, 10).map((g, idx) => (
            <div
              key={`${g.name}-${idx}`}
              className="rounded-[var(--radius-card)] border border-white/10 bg-black/15 px-3 py-2 flex items-start gap-2"
            >
              <span className="material-symbols-outlined text-[var(--outline)] text-lg">
                {gearIcon(g.type)}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[var(--color-silver-muted)] truncate">
                  {g.name}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                  {g.type} · {g.power_cost}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

