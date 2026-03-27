"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ClassCard } from "@/components/character/class-card";
import { StatPill } from "@/components/character/stat-pill";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { SkeletonCard } from "@/components/ui/loading-skeleton";
import { PillSelect } from "@/components/ui/pill-select";
import {
  ClassProfileSchema,
  type CharacterStats,
  type ClassProfile,
} from "@/lib/schemas/domain";
import {
  CLASSES,
  getStartingEquipment,
  RACES,
  type CharacterClass,
  type CharacterRace,
} from "@/lib/rules/character";

const CUSTOM_CLASSES_ENABLED =
  (process.env.NEXT_PUBLIC_CUSTOM_CLASSES_ENABLED ?? "false").toLowerCase() === "true";
const ABILITY_BUDGET_CAP = 10;
const GEAR_BUDGET_CAP = 7;
const STAT_BIAS_CAP = 5;

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
  const [classMode, setClassMode] = useState<"preset" | "custom">("preset");
  const [customConcept, setCustomConcept] = useState("");
  const [customRole, setCustomRole] = useState<ClassProfile["combat_role"]>("specialist");
  const [customClassProfile, setCustomClassProfile] = useState<ClassProfile | null>(null);
  const [classGenLoading, setClassGenLoading] = useState(false);
  const [race, setRace] = useState<CharacterRace>("human");
  const [pronouns, setPronouns] = useState("they/them");
  const [traits, setTraits] = useState("");
  const [backstory, setBackstory] = useState("");
  const [appearance, setAppearance] = useState("");
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
    () =>
      classMode === "custom" && customClassProfile
        ? customClassProfile.starting_gear.map((item) => ({
            name: item.name,
            type: item.type,
          }))
        : getStartingEquipment(characterClass),
    [characterClass, classMode, customClassProfile],
  );

  const selectedMeta = useMemo(
    () => CLASSES.find((c) => c.value === characterClass),
    [characterClass],
  );
  const classPreviewLabel =
    classMode === "custom"
      ? customClassProfile?.display_name || "Custom Class"
      : (selectedMeta?.label ?? "");
  const classPreviewRole =
    classMode === "custom" ? customClassProfile?.combat_role : selectedMeta?.role;
  const classPreviewFantasy =
    classMode === "custom" ? customClassProfile?.fantasy : selectedMeta?.fantasy;
  const customAbilityBudget = useMemo(
    () =>
      customClassProfile?.abilities.reduce((sum, a) => sum + a.power_cost, 0) ?? 0,
    [customClassProfile],
  );
  const customGearBudget = useMemo(
    () =>
      customClassProfile?.starting_gear.reduce((sum, g) => sum + g.power_cost, 0) ?? 0,
    [customClassProfile],
  );
  const customStatBiasBudget = useMemo(
    () =>
      customClassProfile
        ? Object.values(customClassProfile.stat_bias).reduce(
            (sum, n) => sum + Math.max(0, n),
            0,
          )
        : 0,
    [customClassProfile],
  );
  const customProfileValidation = useMemo(() => {
    if (!customClassProfile) return null;
    return ClassProfileSchema.safeParse(customClassProfile);
  }, [customClassProfile]);

  async function handleReroll() {
    await fetchStats(true);
  }

  async function handleGenerateClass() {
    if (!CUSTOM_CLASSES_ENABLED) {
      setError("Custom classes are currently disabled.");
      return;
    }
    if (!customConcept.trim()) {
      setError("Describe your custom class concept first.");
      return;
    }
    setClassGenLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/characters/generate-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept: customConcept.trim(),
          rolePreference: customRole,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error ?? "Could not generate class profile");
        return;
      }
      const data = (await res.json()) as { classProfile?: ClassProfile };
      if (!data.classProfile) {
        setError("Could not generate class profile");
        return;
      }
      setCustomClassProfile(data.classProfile);
    } catch {
      setError("Could not generate class profile");
    } finally {
      setClassGenLoading(false);
    }
  }

  async function handleSubmit() {
    const playerId = resolvePlayerId();
    if (!sessionId || !playerId || !stats) return;
    if (classMode === "custom") {
      if (!customClassProfile) {
        setError("Generate a custom class profile before entering.");
        return;
      }
      const valid = ClassProfileSchema.safeParse(customClassProfile);
      if (!valid.success) {
        const issue = valid.error.issues[0]?.message ?? "Custom class profile is invalid.";
        setError(issue);
        return;
      }
    }
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
          characterClass:
            classMode === "custom"
              ? (customClassProfile?.display_name.trim() || customConcept.trim() || "custom")
              : characterClass,
          race,
          stats,
          pronouns: pronouns.trim() || "they/them",
          traits: traits.trim()
            ? traits
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined,
          backstory: backstory.trim() || undefined,
          appearance: appearance.trim() || undefined,
          classProfile: classMode === "custom" ? customClassProfile ?? undefined : undefined,
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
    (classMode === "preset" ||
      (customClassProfile !== null &&
        customProfileValidation !== null &&
        customProfileValidation.success)) &&
    Boolean(playerIdResolved);

  if (!sessionId) {
    return (
      <main className="min-h-dvh flex items-center justify-center px-4 bg-[var(--color-obsidian)]">
        <p className="text-[var(--color-silver-dim)]">Invalid session</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-[var(--color-obsidian)] text-[var(--color-silver-muted)] px-6 pb-8 pt-8 max-w-lg mx-auto flex flex-col gap-8">
      {/* Title */}
      <header className="text-center space-y-2">
        <h1 className="text-fantasy text-2xl font-black uppercase tracking-tight text-[var(--color-silver-muted)]">
          Forge Your Hero
        </h1>
        <p className="text-[10px] text-[var(--outline)] uppercase tracking-[0.2em]">
          Shape the vessel that enters Ashveil
        </p>
      </header>

      {/* Class Preview */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.15)] bg-gradient-to-b from-[var(--surface-container)] to-[var(--color-obsidian)] p-6 flex flex-col items-center gap-3">
        {classMode === "preset" && selectedMeta?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selectedMeta.imageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-45"
            loading="eager"
            decoding="async"
          />
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/65 to-transparent" />
        <span className="relative text-7xl leading-none select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]" aria-hidden>
          {selectedMeta?.icon ?? "—"}
        </span>
        <div className="text-center space-y-1.5">
          <h2 className="relative text-fantasy text-xl text-[var(--color-silver-muted)]">
            {classPreviewLabel}
          </h2>
          {classPreviewRole ? (
            <p className="relative text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
              {classPreviewRole}
            </p>
          ) : null}
          {classPreviewFantasy ? (
            <p className="relative text-xs text-[var(--color-silver-dim)] max-w-[28ch] italic leading-relaxed">
              {classPreviewFantasy}
            </p>
          ) : null}
        </div>
      </div>

      {/* Name */}
      <section className="flex flex-col gap-3">
        <label
          htmlFor="hero-name"
          className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
        >
          Hero Name
        </label>
        <input
          id="hero-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          maxLength={48}
          className="w-full min-h-[48px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 text-lg font-serif text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
          placeholder="What shall we call you?"
        />
      </section>

      {/* Pronouns */}
      <section className="flex flex-col gap-3">
        <label
          htmlFor="hero-pronouns"
          className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
        >
          Pronouns
        </label>
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <PillSelect
            options={[
              { value: "he/him", label: "He / Him" },
              { value: "she/her", label: "She / Her" },
              { value: "they/them", label: "They / Them" },
            ]}
            value={pronouns}
            onChange={setPronouns}
            wrap={false}
            className="w-max pb-1"
          />
        </div>
      </section>


      {/* Appearance */}
      <section className="flex flex-col gap-3">
        <label
          htmlFor="hero-appearance"
          className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
        >
          Appearance
          <span className="text-[var(--outline)]/40 normal-case tracking-normal ml-2 font-normal">
            optional
          </span>
        </label>
        <textarea
          id="hero-appearance"
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          maxLength={220}
          rows={2}
          className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 py-3 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
          placeholder="e.g. scarred jaw, raven cloak, silver-trim armor, amber eyes"
        />
      </section>
      {/* Backstory */}
      <section className="flex flex-col gap-3">
        <label
          htmlFor="hero-backstory"
          className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
        >
          Backstory
          <span className="text-[var(--outline)]/40 normal-case tracking-normal ml-2 font-normal">
            optional
          </span>
        </label>
        <textarea
          id="hero-backstory"
          value={backstory}
          onChange={(e) => setBackstory(e.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 py-3 text-sm font-serif italic text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
          placeholder="A brief origin story — the AI weaves it into narration"
        />
      </section>

      {/* Traits */}
      <section className="flex flex-col gap-3">
        <label
          htmlFor="hero-traits"
          className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
        >
          Traits
          <span className="text-[var(--outline)]/40 normal-case tracking-normal ml-2 font-normal">
            comma-separated, optional
          </span>
        </label>
        <input
          id="hero-traits"
          type="text"
          value={traits}
          onChange={(e) => setTraits(e.target.value)}
          autoComplete="off"
          maxLength={200}
          className="w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
          placeholder="e.g. cautious, scarred, short-tempered"
        />
      </section>

      {/* Class */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Class
          </h2>
        </div>
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <PillSelect
            options={[
              { value: "preset", label: "Preset" },
              ...(CUSTOM_CLASSES_ENABLED
                ? [{ value: "custom", label: "Create Your Own" }]
                : []),
            ]}
            value={classMode}
            onChange={(value) => setClassMode(value as "preset" | "custom")}
            wrap={false}
            className="w-max pb-1"
          />
        </div>
        {classMode === "preset" ? (
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <div className="flex gap-3 pb-1 w-max">
            {CLASSES.map((c) => (
              <ClassCard
                key={c.value}
                icon={c.icon}
                imageUrl={c.imageUrl}
                label={c.label}
                role={c.role}
                selected={characterClass === c.value}
                onClick={() => setCharacterClass(c.value)}
              />
            ))}
          </div>
        </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label
              htmlFor="custom-class-concept"
              className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
            >
              Class Concept
            </label>
            <textarea
              id="custom-class-concept"
              value={customConcept}
              onChange={(e) => setCustomConcept(e.target.value)}
              maxLength={180}
              rows={3}
              className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 py-3 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
              placeholder="e.g. cybernetic ronin with a mono-katana and tactical neural reflexes"
            />
            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
              <PillSelect
                options={[
                  { value: "frontline", label: "Frontline" },
                  { value: "skirmisher", label: "Skirmisher" },
                  { value: "arcane", label: "Arcane" },
                  { value: "support", label: "Support" },
                  { value: "guardian", label: "Guardian" },
                  { value: "specialist", label: "Specialist" },
                ]}
                value={customRole}
                onChange={(value) => setCustomRole(value as ClassProfile["combat_role"])}
                wrap={false}
                className="w-max pb-1"
              />
            </div>
            <GhostButton
              type="button"
              className="w-full min-h-[44px] text-[10px] font-bold uppercase tracking-[0.15em]"
              disabled={classGenLoading}
              onClick={() => void handleGenerateClass()}
            >
              {classGenLoading ? "Generating…" : "Generate Build"}
            </GhostButton>

            {customClassProfile ? (
              <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)] p-4 flex flex-col gap-3">
                <label
                  htmlFor="custom-class-name"
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
                >
                  Custom Class Name
                </label>
                <input
                  id="custom-class-name"
                  type="text"
                  value={customClassProfile.display_name}
                  onChange={(e) =>
                    setCustomClassProfile((prev) =>
                      prev ? { ...prev, display_name: e.target.value.slice(0, 40) } : prev,
                    )
                  }
                  className="w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                />
                <label
                  htmlFor="custom-class-fantasy"
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
                >
                  Fantasy Summary
                </label>
                <textarea
                  id="custom-class-fantasy"
                  rows={2}
                  value={customClassProfile.fantasy}
                  onChange={(e) =>
                    setCustomClassProfile((prev) =>
                      prev ? { ...prev, fantasy: e.target.value.slice(0, 180) } : prev,
                    )
                  }
                  className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-4 py-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
                />
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                  Ability Budget {customAbilityBudget}/{ABILITY_BUDGET_CAP}
                </p>
                <div className="flex flex-col gap-2">
                  {customClassProfile.abilities.map((ability, idx) => (
                    <div key={`${ability.name}-${idx}`} className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={ability.name}
                        onChange={(e) =>
                          setCustomClassProfile((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.abilities];
                            next[idx] = { ...next[idx]!, name: e.target.value.slice(0, 40) };
                            return { ...prev, abilities: next };
                          })
                        }
                        className="col-span-2 w-full min-h-[40px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                      />
                      <PillSelect
                        options={[
                          { value: "active", label: "Active" },
                          { value: "passive", label: "Passive" },
                        ]}
                        value={ability.type}
                        onChange={(value) =>
                          setCustomClassProfile((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.abilities];
                            next[idx] = { ...next[idx]!, type: value as typeof ability.type };
                            return { ...prev, abilities: next };
                          })
                        }
                        wrap={false}
                        className="w-max pb-1"
                      />
                      <PillSelect
                        options={[
                          { value: "damage", label: "Damage" },
                          { value: "heal", label: "Heal" },
                          { value: "shield", label: "Shield" },
                          { value: "buff", label: "Buff" },
                          { value: "debuff", label: "Debuff" },
                          { value: "mobility", label: "Mobility" },
                          { value: "utility", label: "Utility" },
                        ]}
                        value={ability.effect_kind}
                        onChange={(value) =>
                          setCustomClassProfile((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.abilities];
                            next[idx] = { ...next[idx]!, effect_kind: value as typeof ability.effect_kind };
                            return { ...prev, abilities: next };
                          })
                        }
                        wrap={false}
                        className="w-max pb-1"
                      />
                      <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                        Resource
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={ability.resource_cost}
                          onChange={(e) =>
                            setCustomClassProfile((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.abilities];
                              next[idx] = {
                                ...next[idx]!,
                                resource_cost: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
                              };
                              return { ...prev, abilities: next };
                            })
                          }
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                        Cooldown
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={ability.cooldown}
                          onChange={(e) =>
                            setCustomClassProfile((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.abilities];
                              next[idx] = {
                                ...next[idx]!,
                                cooldown: Math.max(0, Math.min(6, Number(e.target.value) || 0)),
                              };
                              return { ...prev, abilities: next };
                            })
                          }
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                        />
                      </label>
                      <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                        Power Cost
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={ability.power_cost}
                          onChange={(e) =>
                            setCustomClassProfile((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.abilities];
                              next[idx] = {
                                ...next[idx]!,
                                power_cost: Math.max(1, Math.min(6, Number(e.target.value) || 1)),
                              };
                              return { ...prev, abilities: next };
                            })
                          }
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                  Gear Budget {customGearBudget}/{GEAR_BUDGET_CAP}
                </p>
                <div className="flex flex-col gap-2">
                  {customClassProfile.starting_gear.map((gear, idx) => (
                    <div key={`${gear.name}-${idx}`} className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={gear.name}
                        onChange={(e) =>
                          setCustomClassProfile((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.starting_gear];
                            next[idx] = { ...next[idx]!, name: e.target.value.slice(0, 40) };
                            return { ...prev, starting_gear: next };
                          })
                        }
                        className="col-span-2 w-full min-h-[40px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                      />
                      <PillSelect
                        options={[
                          { value: "weapon", label: "Weapon" },
                          { value: "armor", label: "Armor" },
                          { value: "focus", label: "Focus" },
                          { value: "tool", label: "Tool" },
                          { value: "cyberware", label: "Cyberware" },
                        ]}
                        value={gear.type}
                        onChange={(value) =>
                          setCustomClassProfile((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.starting_gear];
                            next[idx] = { ...next[idx]!, type: value as typeof gear.type };
                            return { ...prev, starting_gear: next };
                          })
                        }
                        wrap={false}
                        className="w-max pb-1"
                      />
                      <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                        Power Cost
                        <input
                          type="number"
                          min={1}
                          max={4}
                          value={gear.power_cost}
                          onChange={(e) =>
                            setCustomClassProfile((prev) => {
                              if (!prev) return prev;
                              const next = [...prev.starting_gear];
                              next[idx] = {
                                ...next[idx]!,
                                power_cost: Math.max(1, Math.min(4, Number(e.target.value) || 1)),
                              };
                              return { ...prev, starting_gear: next };
                            })
                          }
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                  Stat Bias Budget {customStatBiasBudget}/{STAT_BIAS_CAP}
                </p>
                {customProfileValidation && !customProfileValidation.success ? (
                  <p className="text-xs text-[var(--color-failure)]">
                    {customProfileValidation.error.issues[0]?.message ??
                      "Custom profile validation failed"}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-[var(--outline)]">
                Generate a build to preview and edit your custom class profile.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Race */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Race
          </h2>
        </div>
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

      {/* Ability Scores */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
              Ability Scores
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void handleReroll()}
            disabled={rerollLoading || !initialRollDone}
            className="min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-[var(--radius-button)] bg-[var(--surface-high)] border border-[rgba(77,70,53,0.2)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[var(--color-gold-rare)]/30 transition-all disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-sm">casino</span>
            {rerollLoading ? "Rolling…" : "Reroll"}
          </button>
        </div>
        {stats ? (
          <div
            key={statsShakeKey}
            className={`grid grid-cols-3 gap-3 ${statsShakeKey > 0 ? "animate-shake-once" : ""}`}
          >
            {STAT_ORDER.map(({ key, label }) => (
              <StatPill key={key} label={label} value={stats[key]} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {STAT_ORDER.map(({ key }) => (
              <SkeletonCard key={key} className="min-h-[80px]" />
            ))}
          </div>
        )}
      </section>

      {/* Starting Gear */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Starting Gear
          </h2>
        </div>
        <div className="bg-[var(--color-midnight)] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.15)] divide-y divide-[rgba(77,70,53,0.1)]">
          {equipment.map((item) => (
            <div key={item.name} className="flex items-center gap-3 px-4 py-3">
              <span className="material-symbols-outlined text-[var(--outline)] text-lg">
                {item.type === "weapon"
                  ? "swords"
                  : item.type === "armor"
                    ? "shield"
                    : "deployed_code"}
              </span>
              <span className="text-sm text-[var(--color-silver-muted)] flex-grow">
                {item.name}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
                {item.type}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Error */}
      {error ? (
        <div className="bg-[var(--color-failure)]/10 border-l-4 border-[var(--color-failure)] p-3 rounded-r-[var(--radius-card)]">
          <p className="text-sm text-[var(--color-failure)]" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {/* Submit */}
      <div className="mt-auto pt-4 space-y-3">
        <GoldButton
          type="button"
          size="lg"
          className="w-full min-h-[56px] flex items-center justify-center gap-3 text-lg"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          <span>{submitLoading ? "Entering…" : "Enter the World"}</span>
          {!submitLoading && (
            <span className="material-symbols-outlined text-lg">swords</span>
          )}
        </GoldButton>
        {!playerIdResolved ? (
          <p className="text-[10px] text-[var(--outline)] text-center uppercase tracking-wider">
            Rejoin the lobby so your seat is saved, then return here.
          </p>
        ) : null}
      </div>
    </main>
  );
}
