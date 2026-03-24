"use client";

import { motion } from "framer-motion";

export interface TurnBannerProps {
  visible: boolean;
}

export function TurnBanner({ visible }: TurnBannerProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none mb-2 flex justify-center px-2"
    >
      <div className="animate-gold-breathe-glow rounded-full border border-[var(--color-gold-rare)]/40 bg-[var(--color-deep-void)]/90 px-5 py-2.5 text-center shadow-[0_4px_24px_rgba(0,0,0,0.5)] backdrop-blur-sm">
        <span className="text-fantasy text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-gold-rare)]">
          Your Turn
        </span>
      </div>
    </motion.div>
  );
}
