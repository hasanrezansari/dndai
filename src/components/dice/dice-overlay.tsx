"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

import { useGameStore } from "@/lib/state/game-store";

const OVERLAY_MS = 3200;

function resultAccent(result: string): {
  label: string;
  glowVar: string;
  textClass: string;
  panelClass: string;
} {
  if (result === "critical_success") {
    return {
      label: "Critical hit",
      glowVar: "var(--color-critical)",
      textClass: "text-[var(--color-silver-muted)]",
      panelClass:
        "border-[color-mix(in_srgb,var(--color-critical)_40%,transparent)]",
    };
  }
  if (result === "critical_failure") {
    return {
      label: "Critical fail",
      glowVar: "var(--color-critical)",
      textClass: "text-[var(--color-silver-muted)]",
      panelClass:
        "border-[color-mix(in_srgb,var(--color-critical)_35%,transparent)]",
    };
  }
  if (result === "success") {
    return {
      label: "Success",
      glowVar: "var(--color-gold-rare)",
      textClass: "text-[var(--color-gold-support)]",
      panelClass:
        "border-[color-mix(in_srgb,var(--color-gold-rare)_35%,transparent)]",
    };
  }
  return {
    label: "Failure",
    glowVar: "var(--color-failure)",
    textClass: "text-[var(--color-failure)]",
    panelClass:
      "border-[color-mix(in_srgb,var(--color-failure)_40%,transparent)]",
  };
}

export function DiceOverlay() {
  const diceOverlay = useGameStore((s) => s.diceOverlay);
  const hideDiceOverlay = useGameStore((s) => s.hideDiceOverlay);

  useEffect(() => {
    if (diceOverlay === null) return;
    const t = window.setTimeout(() => {
      hideDiceOverlay();
    }, OVERLAY_MS);
    return () => window.clearTimeout(t);
  }, [diceOverlay, hideDiceOverlay]);

  const accent = diceOverlay ? resultAccent(diceOverlay.result) : null;
  const diceUpper = diceOverlay?.diceType.toUpperCase() ?? "";

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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center px-5"
          style={{
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            background: "var(--glass-bg-heavy)",
          }}
        >
          <p className="mb-2 max-w-[20rem] text-center text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--outline)]">
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
            className={`relative mb-8 flex h-40 w-40 items-center justify-center rounded-2xl border-2 bg-[var(--color-midnight)]/92 shadow-2xl ${accent.panelClass} ${
              diceOverlay.result === "critical_success" ||
              diceOverlay.result === "critical_failure"
                ? "animate-pulse-glow"
                : ""
            }`}
            style={{
              boxShadow: `0 0 56px color-mix(in srgb, ${accent.glowVar} 45%, transparent)`,
            }}
          >
            <span
              className={`text-data text-6xl font-black tabular-nums ${accent.textClass}`}
            >
              {diceOverlay.rollValue}
            </span>
          </motion.div>

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--outline)]">
              {diceUpper} check
            </p>
            <p className="text-data text-lg tabular-nums text-[var(--color-silver-muted)]">
              <span className="text-[var(--color-silver-dim)]">{diceUpper}</span>{" "}
              <span className="font-black text-[var(--color-silver-muted)]">
                {diceOverlay.rollValue}
              </span>
              <span className="text-[var(--color-silver-dim)]"> + </span>
              <span className="font-semibold">{diceOverlay.modifier}</span>
              <span className="text-[var(--color-silver-dim)]"> = </span>
              <span className="text-xl font-black text-[var(--color-silver-muted)]">
                {diceOverlay.total}
              </span>
            </p>
          </div>

          <p
            className={`mt-6 text-center text-lg font-black uppercase tracking-[0.12em] ${accent.textClass}`}
          >
            {accent.label}
          </p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
