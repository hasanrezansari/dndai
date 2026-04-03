"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { WorldLaneRail } from "@/components/worlds/world-lane-rail";
import type { WorldGalleryCardModel } from "@/components/worlds/world-gallery-card";
import { WorldGalleryCard } from "@/components/worlds/world-gallery-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { GlassCard } from "@/components/ui/glass-card";
import { ROMA_MODULES } from "@/lib/rome/modules";
import { FEATURED_WORLD_SLUG } from "@/lib/worlds/featured-slug";

const ROMA_SLUG_SET = new Set(
  ROMA_MODULES.map((m) => m.key.replace(/_/g, "-")),
);

type WorldLane = { id: string; title: string; worlds: WorldGalleryCardModel[] };

function parseWorld(raw: unknown): WorldGalleryCardModel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.slug !== "string" || typeof o.title !== "string") return null;
  const tags = Array.isArray(o.tags)
    ? o.tags.map((t) => String(t)).filter(Boolean)
    : [];
  return {
    slug: o.slug,
    title: o.title,
    subtitle: typeof o.subtitle === "string" ? o.subtitle : null,
    cardTeaser: typeof o.cardTeaser === "string" ? o.cardTeaser : null,
    forkCount: typeof o.forkCount === "number" ? o.forkCount : 0,
    likeCount: typeof o.likeCount === "number" ? o.likeCount : 0,
    tags,
    coverImageUrl: typeof o.coverImageUrl === "string" ? o.coverImageUrl : null,
    coverImageAlt: typeof o.coverImageAlt === "string" ? o.coverImageAlt : null,
    isFeatured: o.isFeatured === true,
  };
}

function parseGalleryPayload(data: unknown): {
  worlds: WorldGalleryCardModel[];
  lanes: WorldLane[];
} {
  if (typeof data !== "object" || data === null || !("worlds" in data)) {
    return { worlds: [], lanes: [] };
  }
  const wRaw = (data as { worlds: unknown }).worlds;
  const worlds = Array.isArray(wRaw)
    ? wRaw.map(parseWorld).filter((x): x is WorldGalleryCardModel => x !== null)
    : [];
  const lRaw = (data as { lanes?: unknown }).lanes;
  const lanes: WorldLane[] = [];
  if (Array.isArray(lRaw)) {
    for (const lane of lRaw) {
      if (typeof lane !== "object" || lane === null) continue;
      const L = lane as Record<string, unknown>;
      if (typeof L.id !== "string" || typeof L.title !== "string") continue;
      const lw = L.worlds;
      const laneWorlds = Array.isArray(lw)
        ? lw.map(parseWorld).filter((x): x is WorldGalleryCardModel => x !== null)
        : [];
      lanes.push({ id: L.id, title: L.title, worlds: laneWorlds });
    }
  }
  return { worlds, lanes };
}

export function WorldsGalleryClient() {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<WorldGalleryCardModel[]>([]);
  const [lanes, setLanes] = useState<WorldLane[]>([]);
  const [gridFilter, setGridFilter] = useState<"all" | "rome">("all");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/worlds");
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError("Could not load worlds");
        return;
      }
      const parsed = parseGalleryPayload(data);
      setWorlds(parsed.worlds);
      setLanes(parsed.lanes);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { heroWorld, gridWorlds } = useMemo(() => {
    const heroWorld =
      worlds.find((w) => w.isFeatured) ??
      worlds.find((w) => w.slug === FEATURED_WORLD_SLUG) ??
      worlds[0] ??
      null;
    const filtered =
      gridFilter === "rome"
        ? worlds.filter((w) => ROMA_SLUG_SET.has(w.slug))
        : worlds;
    return { heroWorld, gridWorlds: filtered };
  }, [worlds, gridFilter]);

  async function onJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || joinBusy) return;
    setJoinBusy(true);
    setJoinErr(null);
    try {
      const res = await fetch("/api/sessions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: code }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not join";
        setJoinErr(msg);
        return;
      }
      router.push(`/lobby/${code}`);
    } catch {
      setJoinErr("Network error");
    } finally {
      setJoinBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-obsidian)] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 border-b border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)]/92 backdrop-blur-[var(--glass-blur)]">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-fantasy text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-gold-rare)] shrink-0"
          >
            Home
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <GhostButton
              type="button"
              size="sm"
              className="min-h-[40px] text-[10px] uppercase tracking-[0.12em]"
              onClick={() => {
                setJoinOpen((v) => !v);
                setJoinErr(null);
              }}
            >
              Join code
            </GhostButton>
            <Link
              href="/profile"
              className="min-h-[40px] px-3 inline-flex items-center rounded-[var(--radius-button)] border border-[rgba(255,255,255,0.10)] text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-silver-dim)] hover:text-[var(--color-gold-rare)]"
            >
              Profile
            </Link>
          </div>
        </div>
        {joinOpen ? (
          <form
            onSubmit={(e) => void onJoinSubmit(e)}
            className="max-w-3xl mx-auto px-4 pb-3 flex flex-col gap-2 border-t border-[rgba(77,70,53,0.12)] pt-3"
          >
            <label className="text-[10px] uppercase tracking-[0.18em] text-[var(--outline)]">
              Join code
            </label>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinErr(null);
                }}
                placeholder="ABC123"
                autoComplete="off"
                maxLength={8}
                className="flex-1 min-h-[44px] px-3 rounded-[var(--radius-card)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.25)] text-[var(--color-gold-rare)] text-center tracking-[0.2em] uppercase"
              />
              <GoldButton
                type="submit"
                size="md"
                className="min-h-[44px] shrink-0"
                disabled={joinBusy}
              >
                {joinBusy ? "…" : "Go"}
              </GoldButton>
            </div>
            {joinErr ? (
              <p className="text-xs text-[var(--color-failure)]">{joinErr}</p>
            ) : null}
          </form>
        ) : null}
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-6 space-y-8">
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--outline)]">
            Curated
          </p>
          <h1 className="text-fantasy text-3xl font-black text-[var(--color-gold-rare)] tracking-tight">
            Story worlds
          </h1>
          <p className="text-sm text-[var(--color-silver-dim)] leading-relaxed">
            Browse settings like a streaming catalog — each world opens a detail page
            where you can start a lobby.
          </p>
          <p className="text-[11px] text-[var(--outline)] leading-relaxed">
            Creators with a Google account can{" "}
            <Link
              href="/worlds/submit"
              className="text-[var(--color-gold-rare)] underline underline-offset-4"
            >
              submit a world
            </Link>{" "}
            for review (not shown publicly until approved).
          </p>
        </section>

        {status === "authenticated" ? (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 bg-[var(--color-gold-rare)]/80 rounded-full" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                Continue
              </h2>
            </div>
            <Link
              href="/adventures"
              className="block rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)]/60 px-4 py-3 text-sm text-[var(--color-silver-muted)] hover:border-[var(--color-gold-rare)]/35 transition-colors min-h-[44px] flex items-center"
            >
              My adventures →
            </Link>
          </section>
        ) : null}

        {error ? (
          <p className="text-sm text-[var(--color-failure)]">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-xs text-[var(--color-silver-dim)]">Loading worlds…</p>
        ) : null}

        {!loading && heroWorld ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 bg-[var(--color-gold-rare)]/80 rounded-full" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                Featured
              </h2>
            </div>
            <Link href={`/worlds/${heroWorld.slug}`} className="block group">
              <GlassCard className="overflow-hidden p-0 border border-[rgba(77,70,53,0.28)] bg-[var(--surface-container)]/40 transition-colors group-hover:border-[var(--color-gold-rare)]/30">
                <div className="relative aspect-[21/9] w-full bg-[var(--color-deep-void)]">
                  {heroWorld.coverImageUrl ? (
                    <Image
                      src={heroWorld.coverImageUrl}
                      alt={heroWorld.coverImageAlt || heroWorld.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 720px"
                      priority
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[rgba(212,175,55,0.15)] to-[var(--color-obsidian)] flex items-center justify-center">
                      <span className="text-fantasy text-5xl font-black text-[var(--color-gold-rare)]/25">
                        {heroWorld.title.slice(0, 1)}
                      </span>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/40 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
                    <h3 className="text-fantasy text-2xl font-bold text-[var(--color-silver-muted)]">
                      {heroWorld.title}
                    </h3>
                    {(heroWorld.cardTeaser || heroWorld.subtitle) ? (
                      <p className="text-sm text-[var(--color-silver-dim)] leading-relaxed line-clamp-2">
                        {heroWorld.cardTeaser || heroWorld.subtitle}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-[var(--outline)]">
                      {heroWorld.forkCount} starts · {heroWorld.likeCount} likes · Open world →
                    </p>
                  </div>
                </div>
              </GlassCard>
            </Link>
          </section>
        ) : null}

        {!loading && lanes.map((lane) => (
          <WorldLaneRail key={lane.id} title={lane.title} worlds={lane.worlds} />
        ))}

        {!loading && worlds.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-1 h-4 bg-[var(--color-gold-rare)]/80 rounded-full" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                  All worlds
                </h2>
              </div>
              <div className="flex gap-1 p-0.5 rounded-[var(--radius-chip)] bg-[var(--color-deep-void)] border border-[rgba(77,70,53,0.2)]">
                <button
                  type="button"
                  onClick={() => setGridFilter("all")}
                  className={`px-2.5 py-1 rounded-[var(--radius-chip)] text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
                    gridFilter === "all"
                      ? "bg-[var(--color-gold-rare)]/20 text-[var(--color-gold-rare)]"
                      : "text-[var(--outline)] hover:text-[var(--color-silver-dim)]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setGridFilter("rome")}
                  className={`px-2.5 py-1 rounded-[var(--radius-chip)] text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
                    gridFilter === "rome"
                      ? "bg-[var(--color-gold-rare)]/20 text-[var(--color-gold-rare)]"
                      : "text-[var(--outline)] hover:text-[var(--color-silver-dim)]"
                  }`}
                >
                  Rome
                </button>
              </div>
            </div>
            {gridWorlds.length === 0 ? (
              <p className="text-xs text-[var(--color-silver-dim)]">
                No worlds in this filter.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {gridWorlds.map((w) => (
                  <WorldGalleryCard key={w.slug} world={w} variant="grid" />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {!loading && worlds.length === 0 && !error ? (
          <p className="text-sm text-[var(--color-silver-dim)]">
            No published worlds yet. Ask the host to run{" "}
            <code className="text-[var(--color-outline)]">pnpm run db:seed:worlds</code>
            .
          </p>
        ) : null}
      </main>
    </div>
  );
}
