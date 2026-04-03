"use client";

import Image from "next/image";
import Link from "next/link";

import { GlassCard } from "@/components/ui/glass-card";

export type WorldGalleryCardModel = {
  slug: string;
  title: string;
  subtitle: string | null;
  cardTeaser: string | null;
  forkCount: number;
  likeCount: number;
  tags: string[];
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  /** Gallery hero selection only; omitted on cards. */
  isFeatured?: boolean;
};

type Props = {
  world: WorldGalleryCardModel;
  /** Narrow portrait for rails; wide for grid hero tiles. */
  variant?: "rail" | "grid";
  className?: string;
};

export function WorldGalleryCard({ world, variant = "grid", className = "" }: Props) {
  const teaser = world.cardTeaser?.trim() || world.subtitle;
  const isRail = variant === "rail";
  const frame =
    isRail
      ? "w-[min(72vw,260px)] shrink-0 snap-start"
      : "w-full";

  return (
    <Link
      href={`/worlds/${world.slug}`}
      className={`block group ${frame} ${className}`.trim()}
    >
      <GlassCard className="overflow-hidden border border-[rgba(77,70,53,0.22)] bg-[var(--color-midnight)]/90 p-0 transition-colors group-hover:border-[var(--color-gold-rare)]/28">
        <div
          className={`relative w-full overflow-hidden bg-[var(--color-deep-void)] ${
            isRail ? "aspect-[2/3]" : "aspect-[16/10]"
          }`}
        >
          {world.coverImageUrl ? (
            <Image
              src={world.coverImageUrl}
              alt={world.coverImageAlt || world.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              sizes={isRail ? "260px" : "(max-width: 640px) 100vw, 50vw"}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col justify-end p-3 bg-gradient-to-br from-[rgba(212,175,55,0.12)] via-[var(--color-deep-void)] to-[var(--color-obsidian)]">
              <span className="text-fantasy text-2xl font-black text-[var(--color-gold-rare)]/40">
                {world.title.slice(0, 1)}
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-transparent to-transparent opacity-90" />
          <div className="absolute bottom-0 left-0 right-0 p-3 space-y-1">
            <h3 className="text-fantasy text-sm font-bold text-[var(--color-silver-muted)] line-clamp-2 drop-shadow-md">
              {world.title}
            </h3>
            {teaser ? (
              <p className="text-[10px] text-[var(--color-silver-dim)] line-clamp-2 leading-relaxed">
                {teaser}
              </p>
            ) : null}
          </div>
        </div>
        <div className="px-3 py-2 flex flex-wrap gap-1.5 border-t border-[rgba(77,70,53,0.15)]">
          {world.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-[0.14em] bg-[var(--color-deep-void)] text-[var(--outline)]"
            >
              {t}
            </span>
          ))}
          <span className="text-[9px] text-[var(--outline)] ml-auto tabular-nums">
            {world.forkCount} · ♥ {world.likeCount}
          </span>
        </div>
      </GlassCard>
    </Link>
  );
}
