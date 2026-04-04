"use client";

import { getBrandName, getBuildTimeBrand } from "@/lib/brand";

export function RouteLoadingUI() {
  const brand = getBuildTimeBrand();
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[var(--color-obsidian)] px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 75% 50% at 50% 35%, rgba(123, 45, 142, 0.1) 0%, transparent 55%), radial-gradient(ellipse 60% 40% at 50% 80%, rgba(212, 175, 55, 0.05) 0%, transparent 50%)",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="rounded-2xl px-5 py-3 animate-pulse-glow">
          <h1
            className="text-fantasy text-4xl sm:text-5xl font-bold text-gold-rare tracking-[0.12em] uppercase animate-breathe"
            style={{
              textShadow:
                "0 0 40px rgba(212, 175, 55, 0.35), 0 0 80px rgba(123, 45, 142, 0.12)",
            }}
          >
            {getBrandName(brand)}
          </h1>
        </div>
        <p className="text-base text-[var(--color-silver-muted)] tracking-wide">
          {brand === "playromana"
            ? "Entering the world…"
            : "Loading your story…"}
        </p>
      </div>
    </div>
  );
}
