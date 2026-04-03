"use client";

import type { WorldGalleryCardModel } from "@/components/worlds/world-gallery-card";
import { WorldGalleryCard } from "@/components/worlds/world-gallery-card";

type Props = {
  title: string;
  worlds: WorldGalleryCardModel[];
};

export function WorldLaneRail({ title, worlds }: Props) {
  if (worlds.length === 0) return null;
  return (
    <section className="space-y-3 -mx-4 px-4">
      <div className="flex items-center gap-2">
        <span className="w-1 h-4 bg-[var(--color-gold-rare)]/80 rounded-full shrink-0" />
        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
          {title}
        </h2>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin [scrollbar-color:rgba(212,175,55,0.25)_transparent]">
        {worlds.map((w) => (
          <WorldGalleryCard key={w.slug} world={w} variant="rail" />
        ))}
      </div>
    </section>
  );
}
