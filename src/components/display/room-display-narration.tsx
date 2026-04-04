"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { COPY } from "@/lib/copy/ashveil";
import { NarrativeTypewriter } from "@/components/game/narrative-typewriter";

export interface RoomDisplayNarrationProps {
  narrativeText: string | null;
  isThinking: boolean;
  /** Larger type for party / TV readability. */
  partyMode?: boolean;
}

/**
 * Cinematic narrator block for `/session/[id]/display` only — full AI prose, no turn UI.
 */
export function RoomDisplayNarration({
  narrativeText,
  isThinking,
  partyMode = false,
}: RoomDisplayNarrationProps) {
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
    <section
      className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-container)]/35 px-6 py-6 backdrop-blur-md sm:px-10 sm:py-8"
      aria-label="Narration"
    >
      <div className="mb-4 flex items-center gap-2">
        <span
          className="material-symbols-outlined text-[var(--color-gold-rare)] text-xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          auto_stories
        </span>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--color-gold-rare)]">
          {partyMode ? "Party merge" : "The Narrator"}
        </p>
      </div>

      <div className="min-h-[12rem] flex-1 overflow-y-auto pr-1">
        {isThinking ? (
          <AnimatePresence mode="wait">
            <motion.p
              key={thinkingLine}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="text-fantasy text-lg italic leading-relaxed text-[var(--color-silver-muted)] sm:text-xl md:text-2xl md:leading-relaxed"
            >
              {thinkingLine}
            </motion.p>
          </AnimatePresence>
        ) : (
          <div
            className={
              partyMode
                ? "text-fantasy text-lg leading-relaxed text-[var(--color-silver-muted)] sm:text-xl md:text-2xl md:leading-relaxed"
                : "text-fantasy text-base leading-relaxed text-[var(--color-silver-muted)] sm:text-lg md:text-xl md:leading-relaxed"
            }
          >
            <NarrativeTypewriter
              text={narrativeText?.trim() ?? ""}
              groupSize={3}
              delayPerGroup={0.06}
            />
          </div>
        )}
      </div>
    </section>
  );
}
