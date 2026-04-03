"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";

interface SceneTransitionProps {
  imageUrl: string | null;
  locationTitle: string | null;
  trigger: boolean;
  duration?: number;
  /** First scene vs later location change — label above the title. */
  kind?: "opening" | "location";
  /** Tap, Continue button, or timer — returns to gameplay. */
  onDismiss?: () => void;
}

export function SceneTransition({
  imageUrl,
  locationTitle,
  trigger,
  duration = 3000,
  kind = "location",
  onDismiss,
}: SceneTransitionProps) {
  const visible = trigger;
  const eyebrow =
    kind === "opening" ? "Your story begins" : "New location";

  useEffect(() => {
    if (!visible || !onDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onDismiss]);

  const transition = useMemo(
    () => ({ duration: Math.max(0.2, duration / 1000), ease: "easeInOut" as const }),
    [duration],
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={eyebrow}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-obsidian)] touch-manipulation select-none [@media(hover:hover)]:cursor-pointer"
          style={{ WebkitTapHighlightColor: "transparent" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          onClick={() => onDismiss?.()}
        >
          {imageUrl ? (
            <motion.div
              className="absolute inset-0"
              initial={{ scale: 1.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-transparent to-transparent" />
            </motion.div>
          ) : (
            <div className="absolute inset-0 bg-[var(--color-deep-void)]" />
          )}

          {locationTitle && (
            <motion.div
              className="relative z-10 max-w-[min(92vw,28rem)] px-6 text-center pointer-events-none"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              <p className="text-fantasy text-[11px] uppercase tracking-[0.28em] text-[var(--color-gold-support)] sm:text-xs sm:tracking-[0.3em]">
                {eyebrow}
              </p>
              <h2 className="mt-2 text-fantasy text-xl font-semibold tracking-wide text-[var(--color-silver-muted)] sm:text-2xl md:text-3xl">
                {locationTitle}
              </h2>
              <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-[var(--color-gold-rare)]/40 to-transparent" />
            </motion.div>
          )}

          {onDismiss ? (
            <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-4 pointer-events-none">
              <motion.p
                className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-silver-dim)] sm:text-[10px] sm:tracking-[0.25em]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                Tap anywhere to play
              </motion.p>
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.75 }}
                className="pointer-events-auto min-h-[48px] w-full max-w-sm rounded-[var(--radius-card)] border border-[rgba(212,175,55,0.35)] bg-[var(--color-obsidian)]/90 px-6 py-3 text-center text-sm font-bold uppercase tracking-[0.18em] text-[var(--color-gold-rare)] shadow-lg shadow-black/40 active:scale-[0.98] transition-transform"
                onClick={() => onDismiss()}
              >
                Continue
              </motion.button>
            </div>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
