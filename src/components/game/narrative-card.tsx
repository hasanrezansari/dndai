"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { NarrativeTypewriter } from "@/components/game/narrative-typewriter";
import { COPY } from "@/lib/copy/ashveil";
import { GlassCard } from "@/components/ui/glass-card";

export interface NarrativeCardProps {
  text: string | null;
  isThinking: boolean;
}

export function NarrativeCard({ text, isThinking }: NarrativeCardProps) {
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [accentNew, setAccentNew] = useState(false);
  const prevTextRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isThinking) return;
    const t = setInterval(
      () => setThinkingIdx((i) => (i + 1) % COPY.thinking.length),
      2800,
    );
    return () => clearInterval(t);
  }, [isThinking]);

  useEffect(() => {
    if (isThinking) return;
    const t = text?.trim() ?? "";
    const prev = prevTextRef.current;
    prevTextRef.current = text;
    if (prev !== undefined && t.length > 0 && t !== (prev?.trim() ?? "")) {
      const show = window.setTimeout(() => setAccentNew(true), 0);
      const hide = window.setTimeout(() => setAccentNew(false), 3000);
      return () => {
        window.clearTimeout(show);
        window.clearTimeout(hide);
      };
    }
    return undefined;
  }, [text, isThinking]);

  const thinkingLine = COPY.thinking[thinkingIdx % COPY.thinking.length]!;

  return (
    <GlassCard
      variant="heavy"
      glow={isThinking}
      className={`relative z-10 -mt-[20px] px-4 py-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-[box-shadow,border-color] duration-500 ${
        isThinking ? "animate-pulse-glow" : ""
      } ${
        accentNew
          ? "border-l-[3px] border-l-[var(--color-gold-rare)] shadow-[inset_3px_0_0_rgba(212,175,55,0.4),0_12px_40px_rgba(0,0,0,0.35)]"
          : ""
      }`}
    >
      <p className="text-fantasy mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gold-support)]">
        NARRATIVE
      </p>
      {isThinking ? (
        <div className="min-h-[4.5rem]">
          <AnimatePresence mode="wait">
            <motion.p
              key={thinkingLine}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="text-fantasy text-[15px] leading-relaxed text-[var(--color-silver-muted)]"
            >
              {thinkingLine}
            </motion.p>
          </AnimatePresence>
        </div>
      ) : (
        <div className="min-h-[4.5rem]">
          <NarrativeTypewriter
            key={text?.trim() ?? ""}
            text={text?.trim() || "The tale begins…"}
            groupSize={2}
            delayPerGroup={0.08}
          />
        </div>
      )}
    </GlassCard>
  );
}
