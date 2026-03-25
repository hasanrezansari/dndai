"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { NarrativeTypewriter } from "@/components/game/narrative-typewriter";
import { COPY } from "@/lib/copy/ashveil";

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
    <div
      className={`relative z-10 -mt-[20px] bg-[var(--color-obsidian)]/90 backdrop-blur-lg rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] px-5 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-500 ${
        isThinking ? "border-[var(--color-gold-rare)]/30 shadow-[0_0_20px_rgba(242,202,80,0.1)]" : ""
      } ${
        accentNew
          ? "border-l-[3px] border-l-[var(--color-gold-rare)]"
          : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_stories
        </span>
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
          Narrative
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
        <div className="min-h-[4.5rem]">
          <NarrativeTypewriter
            key={text?.trim() ?? ""}
            text={text?.trim() || "The tale begins…"}
            groupSize={2}
            delayPerGroup={0.08}
          />
        </div>
      )}
    </div>
  );
}
