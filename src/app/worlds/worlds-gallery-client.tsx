"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { GlassCard } from "@/components/ui/glass-card";
import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";
import { FEATURED_WORLD_SLUG } from "@/lib/worlds/featured-slug";

type WorldCard = {
  slug: string;
  title: string;
  subtitle: string | null;
  sortOrder: number;
  isFeatured: boolean;
  forkCount: number;
  likeCount: number;
};

function parseWorldsPayload(data: unknown): WorldCard[] {
  if (
    typeof data !== "object" ||
    data === null ||
    !("worlds" in data) ||
    !Array.isArray((data as { worlds: unknown }).worlds)
  ) {
    return [];
  }
  const raw = (data as { worlds: unknown[] }).worlds;
  return raw
    .map((w) => {
      if (typeof w !== "object" || w === null) return null;
      const o = w as Record<string, unknown>;
      if (typeof o.slug !== "string" || typeof o.title !== "string") return null;
      return {
        slug: o.slug,
        title: o.title,
        subtitle: typeof o.subtitle === "string" ? o.subtitle : null,
        sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : 0,
        isFeatured: o.isFeatured === true,
        forkCount: typeof o.forkCount === "number" ? o.forkCount : 0,
        likeCount: typeof o.likeCount === "number" ? o.likeCount : 0,
      };
    })
    .filter((x): x is WorldCard => x !== null);
}

export function WorldsGalleryClient() {
  const router = useRouter();
  const { status } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<WorldCard[]>([]);
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
      setWorlds(parseWorldsPayload(data));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { hero, rest } = useMemo(() => {
    const heroWorld =
      worlds.find((w) => w.isFeatured) ??
      worlds.find((w) => w.slug === FEATURED_WORLD_SLUG) ??
      worlds[0];
    if (!heroWorld) return { hero: null as WorldCard | null, rest: [] as WorldCard[] };
    return {
      hero: heroWorld,
      rest: worlds.filter((w) => w.slug !== heroWorld.slug),
    };
  }, [worlds]);

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
            Pick a published setting, start a lobby, invite friends — same flow as home
            create.
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

        {!loading && hero ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 bg-[var(--color-gold-rare)]/80 rounded-full" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                Featured
              </h2>
            </div>
            <Link href={`/worlds/${hero.slug}`} className="block group">
              <GlassCard className="p-5 border border-[rgba(77,70,53,0.28)] bg-[var(--surface-container)]/40 transition-colors group-hover:border-[var(--color-gold-rare)]/30">
                <h3 className="text-fantasy text-xl font-bold text-[var(--color-silver-muted)]">
                  {hero.title}
                </h3>
                {hero.subtitle ? (
                  <p className="text-sm text-[var(--color-silver-dim)] mt-2 leading-relaxed">
                    {hero.subtitle}
                  </p>
                ) : null}
                <p className="text-[10px] text-[var(--outline)] mt-3">
                  {hero.forkCount} starts · {hero.likeCount} likes
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-gold-rare)] mt-2">
                  Open world →
                </p>
              </GlassCard>
            </Link>
          </section>
        ) : null}

        {rest.length > 0 ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 bg-[var(--color-gold-rare)]/80 rounded-full" />
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
                All worlds
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {rest.map((w) => (
                <Link key={w.slug} href={`/worlds/${w.slug}`} className="block group">
                  <GlassCard className="h-full p-4 border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)]/80 min-h-[120px] transition-colors group-hover:border-[var(--color-gold-rare)]/28">
                    <h3 className="text-fantasy text-base font-bold text-[var(--color-silver-muted)]">
                      {w.title}
                    </h3>
                    {w.subtitle ? (
                      <p className="text-xs text-[var(--color-silver-dim)] mt-2 line-clamp-3">
                        {w.subtitle}
                      </p>
                    ) : null}
                    <p className="text-[10px] text-[var(--outline)] mt-2">
                      {w.forkCount} starts · {w.likeCount} likes
                    </p>
                  </GlassCard>
                </Link>
              ))}
            </div>
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
