"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { COPY } from "@/lib/copy/ashveil";

export interface NarrativeCardProps {
  isThinking: boolean;
  roundNumber: number;
  currentPlayerName: string | null;
  phaseLabel?: string | null;
}

export function NarrativeCard({
  isThinking,
  roundNumber,
  currentPlayerName,
  phaseLabel,
}: NarrativeCardProps) {
  const [thinkingIdx, setThinkingIdx] = useState(0);

  useEffect(() => {
    if (!isThinking) return;
    const t = setInterval(
      () => setThinkingIdx((i) => (i + 1) % COPY.thinking.length),
      2800,
    );
    return () => clearInterval(t);
  }, [isThinking]);

  const thinkingLine = COPY.thinking[thinkingIdx % COPY.thinking.length]!;

  return (
    <div
      className={`relative z-10 -mt-[20px] bg-[var(--color-obsidian)]/90 backdrop-blur-lg rounded-[var(--radius-card)] border border-[var(--border-ui)] px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-500 ${
        isThinking ? "border-[var(--color-gold-rare)]/30 shadow-[0_0_20px_rgba(242,202,80,0.1)]" : ""
      } ${isThinking ? "border-l-[3px] border-l-[var(--color-gold-rare)]" : ""}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_stories
        </span>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
          Current Beat
        </p>
      </div>
      {isThinking ? (
        <div className="min-h-[4.5rem]">
          <AnimatePresence mode="wait">
            <motion.p
              key={thinkingLine}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="text-fantasy text-[15px] italic leading-relaxed text-[var(--color-silver-muted)]"
            >
              {thinkingLine}
            </motion.p>
          </AnimatePresence>
        </div>
      ) : (
        <div className="min-h-[4.5rem] space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--outline)]">
            Whose turn
          </p>
          <p className="text-fantasy text-[15px] font-semibold leading-snug text-[var(--color-silver-muted)]">
            {currentPlayerName ? `${currentPlayerName}` : "Awaiting player"}
          </p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
            Round {roundNumber}
            {phaseLabel?.trim() ? ` · ${phaseLabel}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
