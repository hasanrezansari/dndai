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
      <div className="rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/30 bg-[var(--color-obsidian)]/90 backdrop-blur-md px-6 py-2.5 shadow-[0_0_24px_rgba(242,202,80,0.15)] flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          swords
        </span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
          Your Turn
        </span>
      </div>
    </motion.div>
  );
}
