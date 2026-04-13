"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { StatPill } from "@/components/character/stat-pill";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { SkeletonCard } from "@/components/ui/loading-skeleton";
import { PillSelect } from "@/components/ui/pill-select";
import { useToast } from "@/components/ui/toast";
import { COPY } from "@/lib/copy/ashveil";
import {
  insufficientSparksToastOptions,
  isInsufficientSparksApi,
} from "@/lib/monetization/insufficient-sparks-ui";
import {
  ClassProfileSchema,
  type CharacterStats,
  type ClassProfile,
} from "@/lib/schemas/domain";
import { getRacesForPremise } from "@/lib/rules/race-presets";
import {
  CHARACTER_RACE_MAX_LEN,
  normalizeCharacterRace,
  type CharacterRace,
} from "@/lib/rules/character";
import {
  SPARK_COST_CUSTOM_CLASS_GENERATION,
  SPARK_COST_PORTRAIT_GENERATION,
} from "@/lib/spark-pricing";

const CUSTOM_RACE_PILL = "__custom__" as const;
type RacePillValue = CharacterRace | typeof CUSTOM_RACE_PILL;

const CUSTOM_CLASSES_ENABLED =
  (process.env.NEXT_PUBLIC_CUSTOM_CLASSES_ENABLED ?? "true").toLowerCase() !== "false";
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

type SavedHero = {
  id: string;
  name: string;
  heroClass: string;
  race: string;
  portraitUrl?: string;
};

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
  const [customConcept, setCustomConcept] = useState("");
  const [customRole, setCustomRole] = useState<ClassProfile["combat_role"]>("specialist");
  const [customClassProfile, setCustomClassProfile] = useState<ClassProfile | null>(null);
  const [classGenLoading, setClassGenLoading] = useState(false);
  const [racePill, setRacePill] = useState<RacePillValue>("human");
  const [customRaceText, setCustomRaceText] = useState("");
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
  const { toast } = useToast();
  const [savedHeroesLoading, setSavedHeroesLoading] = useState(false);
  const [savedHeroes, setSavedHeroes] = useState<SavedHero[]>([]);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitBusy, setPortraitBusy] = useState(false);
  const [tablePremise, setTablePremise] = useState<{
    adventure_prompt: string | null;
    adventure_tags: string[] | null;
    world_bible: string | null;
    art_direction: string | null;
  } | null>(null);

  const premiseFields = useMemo(
    () => ({
      adventure_prompt: tablePremise?.adventure_prompt,
      adventure_tags: tablePremise?.adventure_tags,
      world_bible: tablePremise?.world_bible,
    }),
    [tablePremise],
  );

  const premiseRaceOptions = useMemo(
    () => getRacesForPremise(premiseFields),
    [premiseFields],
  );

  const racePillOptions = useMemo(
    () => [
      ...premiseRaceOptions,
      { value: CUSTOM_RACE_PILL, label: "Custom…" },
    ],
    [premiseRaceOptions],
  );

  const raceForApi = useMemo(() => {
    if (racePill === CUSTOM_RACE_PILL) return customRaceText.trim();
    return racePill;
  }, [racePill, customRaceText]);

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
        adventure_prompt?: string | null;
        adventure_tags?: unknown;
        world_bible?: string | null;
        art_direction?: string | null;
      };
      const tags = Array.isArray(data.adventure_tags)
        ? data.adventure_tags.map(String)
        : null;
      if (!cancelled) {
        setTablePremise({
          adventure_prompt: data.adventure_prompt ?? null,
          adventure_tags: tags,
          world_bible: data.world_bible ?? null,
          art_direction: data.art_direction ?? null,
        });
      }
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

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let cancelled = false;
    setSavedHeroesLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/profile/heroes");
        const data: unknown = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const d = data as { heroes?: SavedHero[] };
        const heroes = Array.isArray(d.heroes) ? d.heroes : [];
        if (!cancelled) setSavedHeroes(heroes);
      } finally {
        if (!cancelled) setSavedHeroesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  const selectedSavedHero = useMemo(() => {
    if (!selectedHeroId) return null;
    return savedHeroes.find((h) => h.id === selectedHeroId) ?? null;
  }, [savedHeroes, selectedHeroId]);

  const equipment = useMemo(
    () =>
      customClassProfile
        ? customClassProfile.starting_gear.map((item) => ({
            name: item.name,
            type: item.type,
          }))
        : [],
    [customClassProfile],
  );

  const classPreviewLabel = customClassProfile?.display_name || "Your role";
  const classPreviewRole = customClassProfile?.combat_role;
  const classPreviewFantasy = customClassProfile?.fantasy;
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
    if (classGenLoading) return;
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
          adventure_prompt: tablePremise?.adventure_prompt ?? undefined,
          adventure_tags: tablePremise?.adventure_tags ?? undefined,
          world_bible: tablePremise?.world_bible ?? undefined,
          art_direction: tablePremise?.art_direction ?? undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        classProfile?: ClassProfile;
      };
      if (!res.ok) {
        if (isInsufficientSparksApi(res.status, j)) {
          toast(
            COPY.spark.profileInsufficient,
            "info",
            insufficientSparksToastOptions(),
          );
        } else {
          setError(j.error ?? "Could not generate class profile");
        }
        return;
      }
      if (!j.classProfile) {
        setError("Could not generate class profile");
        return;
      }
      setCustomClassProfile(j.classProfile);
    } catch {
      setError("Could not generate class profile");
    } finally {
      setClassGenLoading(false);
    }
  }

  async function handleRandomFromPremise() {
    if (classGenLoading) return;
    if (!CUSTOM_CLASSES_ENABLED) {
      setError("Custom classes are currently disabled.");
      return;
    }
    if (!sessionId) return;
    setClassGenLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/characters/generate-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          random_from_premise: true,
          session_id: sessionId,
          rolePreference: customRole,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        classProfile?: ClassProfile;
        usedFreePremiseRandom?: boolean;
      };
      if (!res.ok) {
        if (isInsufficientSparksApi(res.status, j)) {
          toast(
            COPY.spark.profileInsufficient,
            "info",
            insufficientSparksToastOptions(),
          );
        } else {
          setError(j.error ?? "Could not generate a random build");
        }
        return;
      }
      if (!j.classProfile) {
        setError("Could not generate a random build");
        return;
      }
      setCustomClassProfile(j.classProfile);
      setCustomConcept(j.classProfile.fantasy?.trim() || j.classProfile.display_name || "");
      if (j.usedFreePremiseRandom) {
        toast("First random build for this story is on the house — edit below.", "success");
      }
    } catch {
      setError("Could not generate a random build");
    } finally {
      setClassGenLoading(false);
    }
  }

  async function handleSubmit() {
    const playerId = resolvePlayerId();
    if (!sessionId || !playerId || !stats) return;
    if (selectedHeroId) {
      setSubmitLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/select-hero`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId,
            heroId: selectedHeroId,
            statsOverride: stats,
          }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "Could not use saved hero");
          return;
        }
        router.push(`/session/${sessionId}`);
      } catch {
        setError("Could not use saved hero");
      } finally {
        setSubmitLoading(false);
      }
      return;
    }
    if (!customClassProfile) {
      setError("Generate a build (random or custom) before entering.");
      return;
    }
    const valid = ClassProfileSchema.safeParse(customClassProfile);
    if (!valid.success) {
      const issue = valid.error.issues[0]?.message ?? "Custom class profile is invalid.";
      setError(issue);
      return;
    }
    const raceNorm = normalizeCharacterRace(raceForApi);
    if (!raceNorm.ok) {
      setError(raceNorm.error);
      return;
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
            customClassProfile?.display_name.trim() || customConcept.trim() || "custom",
          race: raceNorm.value,
          stats,
          portraitUrl: portraitUrl?.trim() || undefined,
          pronouns: pronouns.trim() || "they/them",
          traits: traits.trim()
            ? traits
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined,
          backstory: backstory.trim() || undefined,
          appearance: appearance.trim() || undefined,
          classProfile: customClassProfile ?? undefined,
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

  async function handleGeneratePortrait() {
    if (portraitBusy) return;
    if (!name.trim()) {
      toast("Enter a name first", "error");
      return;
    }
    const portraitRace = normalizeCharacterRace(raceForApi);
    if (!portraitRace.ok) {
      toast(portraitRace.error, "error");
      return;
    }
    setPortraitBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/characters/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          heroClass:
            customClassProfile?.display_name.trim() || customConcept.trim() || "custom",
          race: portraitRace.value,
          concept: customConcept.trim() || undefined,
          appearance: appearance.trim() || undefined,
          reroll: Boolean(portraitUrl),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        portraitUrl?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (isInsufficientSparksApi(res.status, j)) {
          toast(
            COPY.spark.profileInsufficient,
            "info",
            insufficientSparksToastOptions(),
          );
        } else {
          toast(j.error ?? "Could not generate portrait", "error");
        }
        return;
      }
      if (!j.portraitUrl) {
        toast("Could not generate portrait", "error");
        return;
      }
      setPortraitUrl(j.portraitUrl);
      toast("Portrait generated", "success");
    } catch {
      toast("Network error generating portrait", "error");
    } finally {
      setPortraitBusy(false);
    }
  }

  const playerIdResolved = resolvePlayerId();
  const canSubmit =
    Boolean(name.trim()) &&
    stats !== null &&
    !submitLoading &&
    Boolean(sessionId) &&
    customClassProfile !== null &&
      customProfileValidation !== null &&
      customProfileValidation.success &&
    Boolean(playerIdResolved) &&
    (racePill !== CUSTOM_RACE_PILL || raceForApi.length > 0);

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
          Shape the hero who steps into this story
        </p>
        <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed max-w-md mx-auto mt-2">
          Start by describing who you are in <em>this</em> story — tone and setting follow your table.
          Quick archetypes stay balanced under the hood; custom builds use the host&apos;s premise when
          generating gear and abilities.
        </p>
      </header>

      <nav
        className="sticky top-0 z-20 -mx-4 px-4 py-2.5 flex gap-2 overflow-x-auto scrollbar-hide border-b border-[var(--border-divide)] bg-[var(--color-obsidian)]/92 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--color-obsidian)]/85"
        aria-label="Character setup sections"
      >
        {[
          { href: "#character-saved", label: "Saved heroes" },
          { href: "#character-identity", label: "Portrait & name" },
          { href: "#character-role", label: "Role & build" },
          { href: "#character-stats", label: "Stats & gear" },
        ].map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="shrink-0 min-h-[40px] inline-flex items-center px-3 rounded-full border border-[var(--border-ui)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-silver-dim)] hover:border-[var(--color-gold-rare)]/40 hover:text-[var(--color-gold-rare)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* Saved Hero */}
      <section
        id="character-saved"
        className="scroll-mt-28 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/30 p-5"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
          Use saved hero
        </p>
        <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
          If you’ve saved a hero on your profile, you can bring them into this adventure.
          Stats can still be rerolled for this world.
        </p>
        {savedHeroesLoading ? (
          <p className="mt-3 text-sm text-[var(--color-silver-dim)]">Loading…</p>
        ) : savedHeroes.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--color-silver-dim)]">
            No saved heroes yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {savedHeroes.map((h) => {
                const active = selectedHeroId === h.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setSelectedHeroId(h.id);
                      setName(h.name);
                      // Deliberately do not force preset class/race UI here.
                      // Saved heroes can be fully freeform; session instantiation uses the saved template server-side.
                    }}
                    className={`relative overflow-hidden rounded-[var(--radius-card)] border text-left transition-colors ${
                      active
                        ? "border-[rgba(212,175,55,0.45)] bg-[var(--surface-high)]/35"
                        : "border-white/10 bg-black/15 hover:bg-white/5"
                    }`}
                    aria-pressed={active}
                  >
                    <div className="absolute inset-0 opacity-70">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          h.portraitUrl?.trim() ||
                          "https://api.dicebear.com/7.x/adventurer/svg?seed=Hero"
                        }
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/70 to-transparent" />
                    <div className="relative p-4 min-h-[8.75rem] flex flex-col gap-1.5">
                      <p className="text-fantasy text-base text-[var(--color-silver-muted)] truncate">
                        {h.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                        {h.heroClass} · {h.race}
                      </p>
                      <div className="mt-auto">
                        {active ? (
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-gold-rare)]">
                            Selected
                          </p>
                        ) : (
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--outline)]">
                            Tap to use
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedSavedHero ? (
              <div className="rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--color-midnight)] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                  Saved hero preview
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        selectedSavedHero.portraitUrl?.trim() ||
                        "https://api.dicebear.com/7.x/adventurer/svg?seed=Hero"
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-fantasy text-lg text-[var(--color-silver-muted)] truncate">
                      {selectedSavedHero.name}
                    </p>
                    <p className="text-xs capitalize text-[var(--color-silver-dim)]">
                      {selectedSavedHero.heroClass} · {selectedSavedHero.race}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
                      Uses the stats you rolled below
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <GhostButton
                    type="button"
                    size="sm"
                    onClick={() => setSelectedHeroId(null)}
                    className="w-full"
                  >
                    Use a different hero
                  </GhostButton>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Portrait */}
      <section
        id="character-identity"
        className="scroll-mt-28 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/30 p-5"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
          Portrait
        </p>
        <p className="mt-2 text-sm text-[var(--color-silver-dim)]">
          Generate a single hero image. Changing it later costs Sparks.
        </p>
        <div className="mt-4 flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-[var(--radius-avatar)] border border-white/10 bg-black/20 shrink-0">
            {portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portraitUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-[var(--outline)] text-xs">
                —
              </div>
            )}
          </div>
          <div className="flex-1">
            <GhostButton
              type="button"
              size="sm"
              disabled={portraitBusy}
              onClick={() => void handleGeneratePortrait()}
              className="w-full"
            >
              {portraitBusy
                ? "Generating…"
                : portraitUrl
                  ? `Reroll (${SPARK_COST_PORTRAIT_GENERATION} Sparks)`
                  : "Generate portrait"}
            </GhostButton>
            {portraitUrl ? (
              <GhostButton
                type="button"
                size="sm"
                disabled={portraitBusy}
                onClick={() => setPortraitUrl(null)}
                className="w-full mt-2"
              >
                Clear
              </GhostButton>
            ) : null}
          </div>
        </div>
      </section>

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
          className="w-full min-h-[48px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 text-lg font-serif text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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

      {/* Class / role */}
      <section id="character-role" className="scroll-mt-28 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Your role
          </h2>
        </div>
        <p className="text-xs text-[var(--color-silver-dim)] leading-relaxed">
          Describe who you are in <em>this</em> story — or roll a random hero aligned to the
          host&apos;s premise. Combat stays on a balanced baseline under the hood.
        </p>
        {CUSTOM_CLASSES_ENABLED ? (
          <div className="flex flex-col gap-3">
            <GoldButton
              type="button"
              size="md"
              className="w-full min-h-[48px] text-[10px] font-black uppercase tracking-[0.14em]"
              disabled={classGenLoading}
              onClick={() => void handleRandomFromPremise()}
            >
              {classGenLoading ? "Generating…" : "Random hero (from table premise)"}
            </GoldButton>
            <p className="text-[10px] text-[var(--outline)] uppercase tracking-[0.1em] text-center leading-relaxed">
              First random per player per story is free. After that,{" "}
              {SPARK_COST_CUSTOM_CLASS_GENERATION} Sparks — same as Generate Build.
            </p>
            <label
              htmlFor="custom-class-concept"
              className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
            >
              Who are you in this story?
            </label>
            <textarea
              id="custom-class-concept"
              value={customConcept}
              onChange={(e) => setCustomConcept(e.target.value)}
              maxLength={180}
              rows={3}
              className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 py-3 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
              placeholder="e.g. timid lady's maid who notices everything; salvage tech on a dying ship; noir fixer with a code"
            />
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
              Quick chassis hint (optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { role: "specialist" as const, label: "Social / nerve" },
                  { role: "skirmisher", label: "Agile / mobile" },
                  { role: "support", label: "Care / bolster" },
                  { role: "arcane", label: "Weird / trained edge" },
                  { role: "frontline", label: "Hold the line" },
                  { role: "guardian", label: "Protect others" },
                ] as const
              ).map(({ role, label }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setCustomRole(role)}
                  className={`min-h-[36px] rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
                    customRole === role
                      ? "border-[var(--color-gold-rare)]/50 bg-[var(--color-gold-rare)]/10 text-[var(--color-gold-rare)]"
                      : "border-white/10 bg-black/20 text-[var(--outline)] hover:border-white/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
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
              <div className="rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--color-midnight)] p-4 flex flex-col gap-3">
                <label
                  htmlFor="custom-class-name"
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
                >
                  Name shown in play
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
                  className="w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
                />
                <label
                  htmlFor="custom-class-fantasy"
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]"
                >
                  One-line pitch
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
                  className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 py-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
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
                        className="col-span-2 w-full min-h-[40px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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
                        size="sm"
                        wrap={false}
                        className="w-full overflow-x-auto scrollbar-hide pb-1"
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
                        size="sm"
                        wrap={false}
                        className="w-full overflow-x-auto scrollbar-hide pb-1"
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
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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
                        className="col-span-2 w-full min-h-[40px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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
                        size="sm"
                        wrap={false}
                        className="w-full overflow-x-auto scrollbar-hide pb-1"
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
                          className="mt-1 w-full min-h-[36px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-3 text-sm text-[var(--color-silver-muted)] focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
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
        ) : (
          <p className="text-xs text-[var(--color-failure)]">
            Custom class generation is disabled on this deployment.
          </p>
        )}
      </section>

      {/* Role preview — updates from your choices above */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-gradient-to-b from-[var(--surface-container)] to-[var(--color-obsidian)] p-6 flex flex-col items-center gap-3">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/65 to-transparent" />
        <span className="relative text-7xl leading-none select-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)]" aria-hidden>
          ✦
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
          className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 py-3 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
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
          className="w-full rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 py-3 text-sm font-serif italic text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 resize-none transition-colors leading-relaxed"
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
          className="w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
          placeholder="e.g. cautious, scarred, short-tempered"
        />
      </section>


      {/* Race */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="w-1 h-5 bg-[var(--color-gold-rare)]" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Race
          </h2>
          <span className="text-[10px] text-[var(--outline)]/70">
            presets match this table&apos;s vibe; Custom is free text (no stat change)
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <PillSelect<RacePillValue>
            options={racePillOptions}
            value={racePill}
            onChange={setRacePill}
            wrap={false}
            className="w-max pb-1"
          />
        </div>
        {racePill === CUSTOM_RACE_PILL ? (
          <label className="flex flex-col gap-2 mt-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
              Describe your people / origin
            </span>
            <input
              type="text"
              value={customRaceText}
              onChange={(e) => setCustomRaceText(e.target.value)}
              autoComplete="off"
              maxLength={CHARACTER_RACE_MAX_LEN}
              placeholder="e.g. Belt miner clone, uplifted octopus, Martian settler"
              className="w-full min-h-[44px] rounded-[var(--radius-button)] bg-[var(--color-deep-void)] border border-[var(--border-ui)] px-4 text-sm text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 focus:outline-none focus:border-[var(--color-gold-rare)]/40 transition-colors"
            />
          </label>
        ) : null}
      </section>

      {/* Ability Scores */}
      <section id="character-stats" className="scroll-mt-28 flex flex-col gap-4">
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
            className="min-h-[44px] flex items-center gap-2 px-4 py-2 rounded-[var(--radius-button)] bg-[var(--surface-high)] border border-[var(--border-ui)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)] hover:border-[var(--color-gold-rare)]/30 transition-all disabled:opacity-30"
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
        <div className="bg-[var(--color-midnight)] rounded-[var(--radius-card)] border border-[var(--border-ui)] divide-y divide-[var(--border-divide)]">
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
