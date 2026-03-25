"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

import { useGameStore } from "@/lib/state/game-store";

function resultAccent(result: string): {
  label: string;
  glow: string;
  text: string;
} {
  if (result === "critical_success") {
    return {
      label: "Critical!",
      glow: "rgba(123, 45, 142, 0.55)",
      text: "#E8D4FF",
    };
  }
  if (result === "critical_failure") {
    return {
      label: "Critical fail",
      glow: "rgba(123, 45, 142, 0.45)",
      text: "#E8D4FF",
    };
  }
  if (result === "success") {
    return {
      label: "Success",
      glow: "rgba(212, 175, 55, 0.45)",
      text: "#D4AF37",
    };
  }
  return {
    label: "Failure",
    glow: "rgba(139, 37, 0, 0.5)",
    text: "#FF8888",
  };
}

export function DiceOverlay() {
  const diceOverlay = useGameStore((s) => s.diceOverlay);
  const hideDiceOverlay = useGameStore((s) => s.hideDiceOverlay);

  useEffect(() => {
    if (diceOverlay === null) return;
    const t = window.setTimeout(() => {
      hideDiceOverlay();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [diceOverlay, hideDiceOverlay]);

  const accent = diceOverlay ? resultAccent(diceOverlay.result) : null;

  return (
    <AnimatePresence>
      {diceOverlay !== null && accent ? (
        <motion.div
          key="dice-overlay"
          role="dialog"
          aria-modal
          aria-label="Dice result"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
          style={{
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            background: "rgba(10, 10, 10, 0.72)",
          }}
        >
          <p className="mb-8 text-center font-sans text-sm uppercase tracking-[0.2em] text-[var(--color-silver-dim)]">
            {diceOverlay.context}
          </p>

          <motion.div
            initial={{ scale: 0.35, rotate: -28, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
            }}
            className="relative mb-10 flex h-36 w-36 items-center justify-center rounded-2xl border border-white/10 bg-[var(--color-midnight)]/90 shadow-2xl"
            style={{
              boxShadow: `0 0 48px ${accent.glow}`,
            }}
          >
            <span
              className="font-mono text-5xl font-semibold tabular-nums"
              style={{ color: accent.text }}
            >
              {diceOverlay.rollValue}
            </span>
          </motion.div>

          <p
            className="font-mono text-lg tabular-nums text-[var(--color-silver-muted)]"
          >
            {diceOverlay.diceType.toUpperCase()}{" "}
            <span className="text-[var(--color-silver-dim)]">+</span>{" "}
            {diceOverlay.modifier}{" "}
            <span className="text-[var(--color-silver-dim)]">=</span>{" "}
            <span className="font-semibold text-white">{diceOverlay.total}</span>
          </p>

          <p
            className="mt-4 text-center font-sans text-base"
            style={{ color: accent.text }}
          >
            {accent.label}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
