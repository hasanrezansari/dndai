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

  /** Full-screen “painting” only when we have nothing to show yet — never cover a real scene. */
  const showBlockingPaintOverlay =
    scenePending && !sceneImage && !previousSceneImage;

  return (
    <div className="relative h-full w-full overflow-hidden">
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

      <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-[var(--color-obsidian)]/50 to-transparent" />

      {showBlockingPaintOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center overflow-hidden"
          aria-busy
        >
          <div className="animate-shimmer absolute inset-0 opacity-[0.97]" />
          <p className="text-fantasy relative z-[1] text-sm tracking-wide text-[var(--color-gold-support)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">
            {COPY.scenePending}
          </p>
        </div>
      ) : null}

      {/* Turn indicator */}
      <div className="absolute right-4 top-4 z-[2]">
        <div className="bg-[var(--color-obsidian)]/80 backdrop-blur-md rounded-[var(--radius-card)] px-4 py-2.5 border border-[rgba(77,70,53,0.2)]">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
            Round {roundNumber}
          </p>
          <p className="text-fantasy mt-0.5 text-xs font-bold text-[var(--color-gold-rare)]">
            {turnLabel}
          </p>
        </div>
      </div>

      {/* Scene title */}
      <div className="absolute bottom-5 left-5 right-[28%] z-[2]">
        <h1
          className="text-fantasy line-clamp-2 text-xl font-black leading-tight tracking-tight text-[var(--color-silver-muted)] sm:text-2xl"
          style={{
            textShadow:
              "0 2px 20px rgba(0,0,0,0.98), 0 1px 6px rgba(0,0,0,0.95)",
          }}
        >
          {sceneTitle ?? "The world awaits…"}
        </h1>
      </div>
    </div>
  );
}
