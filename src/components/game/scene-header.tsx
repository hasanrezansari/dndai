"use client";

import { AnimatePresence, motion } from "framer-motion";

import { COPY } from "@/lib/copy/ashveil";

export interface SceneHeaderProps {
  sceneImage: string | null;
  previousSceneImage: string | null;
  sceneTitle: string | null;
  roundNumber: number;
  currentPlayerName: string | null;
  scenePending: boolean;
}

export function SceneHeader({
  sceneImage,
  previousSceneImage,
  sceneTitle,
  roundNumber,
  currentPlayerName,
  scenePending,
}: SceneHeaderProps) {
  const turnLabel = currentPlayerName
    ? `${currentPlayerName}'s turn`
    : "Waiting…";

  const showBackdrop = !sceneImage && !previousSceneImage;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-b-[var(--radius-card)]">
      <div className="absolute inset-0">
        {showBackdrop ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(165deg, var(--color-deep-void) 0%, var(--atmosphere-mystery) 45%, var(--color-midnight) 100%)",
            }}
          />
        ) : null}

        {previousSceneImage && sceneImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previousSceneImage}
            alt=""
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
        ) : null}

        <AnimatePresence initial={false}>
          {sceneImage ? (
            <motion.img
              key={sceneImage}
              src={sceneImage}
              alt=""
              loading="eager"
              decoding="async"
              className="absolute inset-0 z-[1] h-full w-full object-cover"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            />
          ) : null}
        </AnimatePresence>

        {!sceneImage && previousSceneImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previousSceneImage}
            alt=""
            loading="eager"
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/65 to-black/55" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-black/50" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />

      {scenePending && (
        <div
          className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center overflow-hidden rounded-b-[var(--radius-card)]"
          aria-busy
        >
          <div className="animate-shimmer absolute inset-0 opacity-[0.97]" />
          <p className="text-fantasy relative z-[1] text-sm tracking-wide text-[var(--color-gold-support)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            {COPY.scenePending}
          </p>
        </div>
      )}

      <div className="absolute right-3 top-3 z-[2] max-w-[min(58%,280px)]">
        <div className="glass rounded-[999px] px-3 py-2 text-right shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
          <p className="text-data text-[10px] uppercase tracking-wider text-[var(--color-silver-dim)]">
            Round {roundNumber}
          </p>
          <p className="text-fantasy mt-0.5 text-xs font-medium leading-tight text-[var(--color-gold-rare)] drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            {turnLabel}
          </p>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-[28%] z-[2]">
        <h1
          className="text-fantasy line-clamp-2 text-xl font-medium leading-tight tracking-wide text-[var(--color-silver-muted)] sm:text-2xl"
          style={{
            textShadow:
              "0 2px 20px rgba(0,0,0,0.98), 0 1px 6px rgba(0,0,0,0.95), 0 0 48px rgba(0,0,0,0.55)",
          }}
        >
          {sceneTitle ?? "The world awaits…"}
        </h1>
      </div>
    </div>
  );
}
