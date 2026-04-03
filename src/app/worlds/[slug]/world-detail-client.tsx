"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { GhostButton } from "@/components/ui/ghost-button";

export type WorldDetailClientProps = {
  slug: string;
  title: string;
  subtitle: string | null;
  cardTeaser: string | null;
  description: string | null;
  tags: string[];
  isFeatured: boolean;
  forkCount: number;
  likeCount: number;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  /** Server-known like state when user was signed in during RSC render. */
  likedInitial?: boolean;
};

export function WorldDetailClient(props: WorldDetailClientProps) {
  const router = useRouter();
  const { status } = useSession();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(props.likeCount);
  const [liked, setLiked] = useState(Boolean(props.likedInitial));
  const [likeBusy, setLikeBusy] = useState(false);

  async function startWorld() {
    if (busy) return;
    setErr(null);
    if (status !== "authenticated") {
      router.push("/");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/worlds/${encodeURIComponent(props.slug)}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Could not start";
        setErr(msg);
        return;
      }
      const joinCode =
        typeof data === "object" &&
        data !== null &&
        "joinCode" in data &&
        typeof (data as { joinCode: unknown }).joinCode === "string"
          ? (data as { joinCode: string }).joinCode
          : null;
      if (joinCode) {
        router.push(`/lobby/${joinCode}`);
      }
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleLike() {
    if (likeBusy) return;
    if (status !== "authenticated") {
      router.push("/");
      return;
    }
    setLikeBusy(true);
    try {
      const method = liked ? "DELETE" : "POST";
      const res = await fetch(
        `/api/worlds/${encodeURIComponent(props.slug)}/like`,
        { method },
      );
      const data: unknown = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.push("/");
        return;
      }
      if (!res.ok) return;
      if (
        typeof data === "object" &&
        data !== null &&
        "likeCount" in data &&
        typeof (data as { likeCount: unknown }).likeCount === "number"
      ) {
        setLikeCount((data as { likeCount: number }).likeCount);
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "liked" in data &&
        typeof (data as { liked: unknown }).liked === "boolean"
      ) {
        setLiked((data as { liked: boolean }).liked);
      }
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-obsidian)] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-[rgba(77,70,53,0.2)] bg-[var(--color-obsidian)]/92 backdrop-blur-[var(--glass-blur)] px-4 py-3 flex items-center justify-between gap-3">
        <Link
          href="/worlds"
          className="inline-flex items-center justify-center min-h-[40px] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] rounded-[var(--radius-button)] border border-[rgba(77,70,53,0.3)] text-[var(--color-silver-muted)] hover:border-[var(--color-gold-rare)] hover:text-[var(--color-gold-rare)] transition-colors"
        >
          ← Worlds
        </Link>
        <Link
          href="/"
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-silver-dim)]"
        >
          Home
        </Link>
      </header>

      <main className="flex-1 max-w-lg mx-auto px-4 pt-6 space-y-6 w-full">
        {props.coverImageUrl ? (
          <div className="relative aspect-[2/1] w-full overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--color-deep-void)] -mx-0">
            <Image
              src={props.coverImageUrl}
              alt={props.coverImageAlt || props.title}
              fill
              className="object-cover"
              sizes="(max-width: 512px) 100vw, 512px"
              priority
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-transparent to-transparent" />
          </div>
        ) : null}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-fantasy text-3xl font-black text-[var(--color-gold-rare)] tracking-tight">
              {props.title}
            </h1>
            {props.isFeatured ? (
              <span className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-[var(--radius-chip)] border border-[var(--color-gold-rare)]/40 text-[var(--color-gold-rare)]">
                Featured
              </span>
            ) : null}
          </div>
          {(props.cardTeaser || props.subtitle) ? (
            <p className="text-sm text-[var(--color-silver-dim)] mt-3 leading-relaxed">
              {props.cardTeaser || props.subtitle}
            </p>
          ) : null}
          <p className="text-[11px] text-[var(--outline)] mt-3 flex flex-wrap gap-x-3 gap-y-1">
            <span>{props.forkCount} starts</span>
            <span>{likeCount} likes</span>
          </p>
        </div>

        {props.description ? (
          props.description.length > 360 ? (
            <details className="group rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-midnight)]/60 p-4 open:bg-[var(--surface-high)]/30">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-gold-rare)] list-none flex items-center justify-between gap-2">
                <span>Full premise</span>
                <span className="material-symbols-outlined text-base text-[var(--outline)] group-open:rotate-180 transition-transform">
                  expand_more
                </span>
              </summary>
              <p className="text-sm text-[var(--color-silver-muted)] leading-relaxed whitespace-pre-wrap mt-3 pt-3 border-t border-[rgba(77,70,53,0.15)]">
                {props.description}
              </p>
            </details>
          ) : (
            <p className="text-sm text-[var(--color-silver-muted)] leading-relaxed whitespace-pre-wrap">
              {props.description}
            </p>
          )
        ) : null}

        {props.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {props.tags.map((t) => (
              <span
                key={t}
                className="px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.16em] bg-[var(--color-deep-void)] text-[var(--outline)] border border-[rgba(255,255,255,0.08)]"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        {status === "authenticated" ? (
          <GhostButton
            type="button"
            size="md"
            className="w-full min-h-[44px] flex items-center justify-center gap-2"
            disabled={likeBusy}
            onClick={() => void toggleLike()}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={{
                fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              favorite
            </span>
            {liked ? "Liked" : "Like this world"}
          </GhostButton>
        ) : null}

        {err ? (
          <p className="text-sm text-[var(--color-failure)]">{err}</p>
        ) : null}

        <div className="flex flex-col gap-3 pt-2">
          <GoldButton
            type="button"
            size="lg"
            className="w-full min-h-[48px]"
            disabled={busy}
            onClick={() => void startWorld()}
          >
            {busy ? "Starting…" : "Start this world"}
          </GoldButton>
          {status !== "authenticated" ? (
            <p className="text-xs text-[var(--color-silver-dim)] text-center">
              Sign in from the home screen to host a table.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
