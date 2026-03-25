"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ClassCard } from "@/components/character/class-card";
import { StatPill } from "@/components/character/stat-pill";
import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { SkeletonCard } from "@/components/ui/loading-skeleton";
import { PillSelect } from "@/components/ui/pill-select";
import type { CharacterStats } from "@/lib/schemas/domain";
import {
  CLASSES,
  getStartingEquipment,
  RACES,
  type CharacterClass,
  type CharacterRace,
} from "@/lib/rules/character";

const STAT_ORDER: { key: keyof CharacterStats; label: string }[] = [
  { key: "str", label: "STR" },
  { key: "dex", label: "DEX" },
  { key: "con", label: "CON" },
  { key: "int", label: "INT" },
  { key: "wis", label: "WIS" },
  { key: "cha", label: "CHA" },
];

export default function CharacterCreationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionIdParam = params.sessionId;
  const sessionId =
    typeof sessionIdParam === "string"
      ? sessionIdParam
      : Array.isArray(sessionIdParam)
        ? sessionIdParam[0]!
        : "";

  const [name, setName] = useState("");
  const [characterClass, setCharacterClass] = useState<CharacterClass>("warrior");
  const [race, setRace] = useState<CharacterRace>("human");
  const [stats, setStats] = useState<CharacterStats | null>(null);
  const [statsShakeKey, setStatsShakeKey] = useState(0);
  const [initialRollDone, setInitialRollDone] = useState(false);
  const [rerollLoading, setRerollLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerIdOverride, setPlayerIdOverride] = useState<string | null>(null);
  const [resolvedPlayerId, setResolvedPlayerId] = useState<string | null>(
    null,
  );
  const { data: authSession, status: authStatus } = useSession();

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("playerId");
      if (q && /^[0-9a-f-]{36}$/i.test(q)) setPlayerIdOverride(q);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !authSession?.user?.id ||
      !sessionId
    ) {
      return;
    }
    const uid = authSession.user.id;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        players?: { id: string; user_id: string }[];
      };
      const me = data.players?.find((p) => p.user_id === uid);
      if (!cancelled && me) setResolvedPlayerId(me.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, authSession?.user?.id, sessionId]);

  const resolvePlayerId = useCallback(() => {
    return playerIdOverride ?? resolvedPlayerId;
  }, [playerIdOverride, resolvedPlayerId]);

  const fetchStats = useCallback(async (withShake: boolean) => {
    setError(null);
    if (withShake) setRerollLoading(true);
    try {
      const res = await fetch("/api/characters/roll-stats", { method: "POST" });
      if (!res.ok) throw new Error("roll failed");
      const data = (await res.json()) as { stats?: CharacterStats };
      if (!data.stats) throw new Error("bad stats");
      setStats(data.stats);
      if (withShake) {
        setStatsShakeKey((k) => k + 1);
      }
    } catch {
      setError("Could not roll stats. Try again.");
    } finally {
      if (withShake) setRerollLoading(false);
      setInitialRollDone(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void fetchStats(false);
  }, [sessionId, fetchStats]);

  const equipment = useMemo(
    () => getStartingEquipment(characterClass),
    [characterClass],
  );

  const selectedMeta = useMemo(
    () => CLASSES.find((c) => c.value === characterClass),
    [characterClass],
  );

  async function handleReroll() {
    await fetchStats(true);
  }

  async function handleSubmit() {
    const playerId = resolvePlayerId();
    if (!sessionId || !playerId || !stats) return;
    setSubmitLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          sessionId,
          name: name.trim(),
          characterClass,
          race,
          stats,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Could not create character");
        return;
      }
      router.push(`/session/${sessionId}`);
    } catch {
      setError("Could not create character");
    } finally {
      setSubmitLoading(false);
    }
  }

  const playerIdResolved = resolvePlayerId();
  const canSubmit =
    Boolean(name.trim()) &&
    stats !== null &&
    !submitLoading &&
    Boolean(sessionId) &&
    Boolean(playerIdResolved);

  if (!sessionId) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4">
        <p className="text-[var(--color-silver-dim)]">Invalid session</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--color-obsidian)] text-[var(--color-silver-muted)] px-4 pb-8 pt-6 max-w-lg mx-auto flex flex-col gap-[var(--void-gap-lg)]">
      <header className="space-y-1">
        <h1 className="text-fantasy text-xl sm:text-2xl uppercase tracking-[0.12em] text-[var(--color-silver-muted)] text-center">
          Forge Your Hero
        </h1>
      </header>

      <GlassCard className="flex flex-col items-center justify-center min-h-[180px] gap-2 bg-[var(--color-deep-void)]/80">
        <span className="text-7xl leading-none select-none" aria-hidden>
          {selectedMeta?.icon ?? "—"}
        </span>
        <p className="text-sm text-[var(--color-silver-dim)]">
          {selectedMeta?.label ?? ""}
        </p>
        {selectedMeta?.role ? (
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-gold-support)]">
            {selectedMeta.role}
          </p>
        ) : null}
        {selectedMeta?.fantasy ? (
          <p className="text-xs text-center text-[var(--color-silver-dim)] max-w-[28ch] px-3">
            {selectedMeta.fantasy}
          </p>
        ) : null}
      </GlassCard>

      <section className="flex flex-col gap-2">
        <label htmlFor="hero-name" className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
          Name
        </label>
        <input
          id="hero-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          maxLength={48}
          className="w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(255,255,255,0.08)] px-4 text-base text-[var(--color-silver-muted)] placeholder:text-[var(--color-silver-dim)] focus:outline-none focus:border-[var(--color-gold-support)]"
          placeholder="Adventurer name"
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
          Class
        </h2>
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <div className="flex gap-3 pb-1 w-max">
            {CLASSES.map((c) => (
              <ClassCard
                key={c.value}
                icon={c.icon}
                label={c.label}
                role={c.role}
                selected={characterClass === c.value}
                onClick={() => setCharacterClass(c.value)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
          Race
        </h2>
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <PillSelect
            options={[...RACES]}
            value={race}
            onChange={setRace}
            wrap={false}
            className="w-max pb-1"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
            Ability scores
          </h2>
          <GhostButton
            type="button"
            size="sm"
            onClick={() => void handleReroll()}
            disabled={rerollLoading || !initialRollDone}
            className="shrink-0 min-h-[44px]"
          >
            {rerollLoading ? "Rolling…" : "Reroll Stats"}
          </GhostButton>
        </div>
        {stats ? (
          <div
            key={statsShakeKey}
            className={`grid grid-cols-3 gap-2 ${statsShakeKey > 0 ? "animate-shake-once" : ""}`}
          >
            {STAT_ORDER.map(({ key, label }) => (
              <StatPill key={key} label={label} value={stats[key]} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {STAT_ORDER.map(({ key }) => (
              <SkeletonCard key={key} className="min-h-[72px]" />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wider text-[var(--color-silver-dim)]">
          Starting gear
        </h2>
        <GlassCard className="px-4 py-3">
          <ul className="text-sm text-[var(--color-silver-dim)] space-y-1">
            {equipment.map((item) => (
              <li key={item.name} className="flex gap-2">
                <span className="text-[var(--color-silver-muted)]">{item.name}</span>
                <span className="text-[var(--color-silver-dim)]">· {item.type}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {error ? (
        <p className="text-sm text-[var(--gradient-hp-end)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        <GoldButton
          type="button"
          size="lg"
          className="w-full min-h-[48px]"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitLoading ? "Entering…" : "Enter the World"}
        </GoldButton>
        {!playerIdResolved ? (
          <p className="text-xs text-[var(--color-silver-dim)] mt-3 text-center">
            Rejoin the lobby so your seat is saved, then return here.
          </p>
        ) : null}
      </div>
    </main>
  );
}
