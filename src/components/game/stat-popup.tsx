"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type { StatPopup as StatPopupData } from "@/lib/state/game-store";
import { useGameStore } from "@/lib/state/game-store";

const POPUP_DURATION = 2000;

const colorMap = {
  red: "text-red-400 drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]",
  green: "text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]",
  blue: "text-blue-400 drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]",
} as const;

function PopupChip({ popup, onDone }: { popup: StatPopupData; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, POPUP_DURATION);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -32, scale: 0.85 }}
      transition={{ duration: POPUP_DURATION / 1000, ease: "easeOut" }}
      className={`pointer-events-none text-center text-sm font-black tabular-nums ${colorMap[popup.color]}`}
    >
      {popup.label}
    </motion.div>
  );
}

export function StatPopupOverlay() {
  const popups = useGameStore((s) => s.statPopups);
  const players = useGameStore((s) => s.players);
  const [active, setActive] = useState<StatPopupData[]>([]);

  useEffect(() => {
    if (popups.length === 0) return;
    setActive((prev) => [...prev, ...popups]);
  }, [popups]);

  function removePopup(id: string) {
    setActive((prev) => prev.filter((p) => p.id !== id));
  }

  const grouped = new Map<string, StatPopupData[]>();
  for (const p of active) {
    const existing = grouped.get(p.playerId) ?? [];
    existing.push(p);
    grouped.set(p.playerId, existing);
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <AnimatePresence>
        {players.map((player, idx) => {
          const items = grouped.get(player.id);
          if (!items?.length) return null;
          const left = 28 + idx * 72;
          return items.map((popup) => (
            <motion.div
              key={popup.id}
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute"
              style={{ left: `${left}px`, top: "70px" }}
            >
              <PopupChip
                popup={popup}
                onDone={() => removePopup(popup.id)}
              />
            </motion.div>
          ));
        })}
      </AnimatePresence>
    </div>
  );
}
