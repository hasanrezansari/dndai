"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

export interface NarrativeTypewriterProps {
  text: string;
  groupSize?: number;
  delayPerGroup?: number;
  onComplete?: () => void;
}

function splitWordGroups(text: string, groupSize: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const groups: string[] = [];
  for (let i = 0; i < words.length; i += groupSize) {
    groups.push(words.slice(i, i + groupSize).join(" "));
  }
  return groups;
}

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function NarrativeTypewriter({
  text,
  groupSize = 2,
  delayPerGroup = 0.08,
  onComplete,
}: NarrativeTypewriterProps) {
  const groups = useMemo(
    () => splitWordGroups(text, groupSize),
    [text, groupSize],
  );
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    setFinished(false);
  }, [text]);

  if (groups.length === 0) {
    return (
      <p className="text-fantasy text-[15px] leading-relaxed text-[var(--color-silver-muted)]">
        {text.trim() || "The tale begins…"}
      </p>
    );
  }

  if (finished) {
    return (
      <p className="text-fantasy text-[15px] leading-relaxed text-[var(--color-silver-muted)]">
        {text}
      </p>
    );
  }

  return (
    <motion.p
      className="text-fantasy text-[15px] leading-relaxed text-[var(--color-silver-muted)]"
      variants={{
        hidden: {},
        show: {
          transition: { staggerChildren: delayPerGroup },
        },
      }}
      initial="hidden"
      animate="show"
    >
      {groups.map((g, i) => (
        <motion.span
          key={`${i}-${g}`}
          variants={itemVariants}
          className="inline"
          onAnimationComplete={() => {
            if (i === groups.length - 1) {
              setFinished(true);
              onComplete?.();
            }
          }}
        >
          {g}
          {i < groups.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </motion.p>
  );
}
