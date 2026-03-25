"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

interface SceneTransitionProps {
  imageUrl: string | null;
  locationTitle: string | null;
  trigger: boolean;
  duration?: number;
}

export function SceneTransition({
  imageUrl,
  locationTitle,
  trigger,
  duration = 3000,
}: SceneTransitionProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [trigger, duration]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-obsidian)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
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
                alt="Scene transition"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-obsidian)] via-transparent to-transparent" />
            </motion.div>
          ) : (
            <div className="absolute inset-0 bg-[var(--color-deep-void)]" />
          )}

          {locationTitle && (
            <motion.div
              className="relative z-10 px-8 text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              <p className="text-fantasy text-xs uppercase tracking-[0.3em] text-[var(--color-gold-support)]">
                New Location
              </p>
              <h2 className="mt-2 text-fantasy text-2xl font-semibold tracking-wide text-[var(--color-silver-muted)] sm:text-3xl">
                {locationTitle}
              </h2>
              <div className="mx-auto mt-3 h-px w-24 bg-gradient-to-r from-transparent via-[var(--color-gold-rare)]/40 to-transparent" />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
