"use client";

import { useCallback, useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { useGameStore } from "@/lib/state/game-store";

const CHIPS = [
  { key: "Attack", icon: "swords" },
  { key: "Spell", icon: "auto_awesome" },
  { key: "Talk", icon: "chat_bubble" },
  { key: "Inspect", icon: "search" },
  { key: "Move", icon: "directions_walk" },
  { key: "Item", icon: "inventory_2" },
] as const;

const CHIP_TEXT: Record<(typeof CHIPS)[number]["key"], string> = {
  Attack: "I attack ",
  Spell: "I cast ",
  Talk: "I want to talk: ",
  Inspect: "I inspect ",
  Move: "I move ",
  Item: "I use an item: ",
};

export interface ActionBarProps {
  isMyTurn: boolean;
  currentPlayerName: string | null;
  onSubmitAction: (text: string) => void | Promise<void>;
}

export function ActionBar({
  isMyTurn,
  currentPlayerName,
  onSubmitAction,
}: ActionBarProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const openSheet = useGameStore((s) => s.openSheet);

  const submit = useCallback(async () => {
    const t = value.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSubmitAction(t);
      setValue("");
    } finally {
      setBusy(false);
    }
  }, [value, onSubmitAction, busy]);

  const safeBottom =
    "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]";

  const sheetBtn =
    "min-h-[44px] flex items-center justify-center gap-1.5 rounded-[var(--radius-chip)] bg-[var(--surface-high)] border border-[rgba(77,70,53,0.15)] px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-silver-dim)] transition-colors hover:text-[var(--color-gold-rare)] hover:border-[var(--color-gold-rare)]/30 active:scale-[0.97]";

  if (isMyTurn) {
    return (
      <div
        className={`bg-[var(--color-obsidian)] border-t border-[rgba(77,70,53,0.15)] space-y-3 px-4 py-3 ${safeBottom}`}
      >
        {/* Sheet shortcuts */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className={sheetBtn}
            onClick={() => openSheet("character")}
          >
            <span className="material-symbols-outlined text-sm">person</span>
            Hero
          </button>
          <button
            type="button"
            className={sheetBtn}
            onClick={() => openSheet("party")}
          >
            <span className="material-symbols-outlined text-sm">group</span>
            Party
          </button>
          <button
            type="button"
            className={sheetBtn}
            onClick={() => openSheet("journal")}
          >
            <span className="material-symbols-outlined text-sm">menu_book</span>
            Journal
          </button>
        </div>

        {/* Input */}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What do you do?"
          className="min-h-[48px] w-full rounded-[var(--radius-button)] border border-[rgba(77,70,53,0.2)] bg-[var(--color-deep-void)] px-4 text-base text-[var(--color-silver-muted)] placeholder:text-[var(--outline)]/40 font-serif italic transition-all duration-200 focus:border-[var(--color-gold-rare)]/40 focus:outline-none focus:shadow-[0_0_20px_rgba(242,202,80,0.1)]"
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />

        {/* Quick action chips */}
        <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() =>
                setValue((v) => {
                  const insert = CHIP_TEXT[c.key];
                  if (!v.trim()) return insert;
                  return `${v.trim()} ${insert}`;
                })
              }
              className="min-h-[40px] shrink-0 flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-high)] border border-[rgba(77,70,53,0.1)] px-4 text-[11px] font-bold uppercase tracking-wider text-[var(--color-silver-dim)] transition-all hover:text-[var(--color-gold-rare)] hover:border-[var(--color-gold-rare)]/20 active:scale-[0.95]"
            >
              <span className="material-symbols-outlined text-sm">
                {c.icon}
              </span>
              {c.key}
            </button>
          ))}
        </div>

        {/* Submit */}
        <GoldButton
          type="button"
          size="lg"
          className="min-h-[52px] w-full flex items-center justify-center gap-3"
          onClick={() => void submit()}
          disabled={!value.trim() || busy}
        >
          <span className="material-symbols-outlined text-lg">casino</span>
          {busy ? "Rolling…" : "Roll + Confirm"}
        </GoldButton>
      </div>
    );
  }

  const name = currentPlayerName ?? "another player";

  return (
    <div className={`bg-[var(--color-obsidian)] border-t border-[rgba(77,70,53,0.15)] space-y-3 px-4 py-3 ${safeBottom}`}>
      <p className="text-center text-xs text-[var(--outline)] flex items-center justify-center gap-2 uppercase tracking-[0.15em]">
        <span className="material-symbols-outlined text-sm animate-pulse">
          hourglass_top
        </span>
        Watching {name}&apos;s turn…
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={sheetBtn}
          onClick={() => openSheet("character")}
        >
          <span className="material-symbols-outlined text-sm">person</span>
          Hero
        </button>
        <button
          type="button"
          className={sheetBtn}
          onClick={() => openSheet("party")}
        >
          <span className="material-symbols-outlined text-sm">group</span>
          Party
        </button>
        <button
          type="button"
          className={sheetBtn}
          onClick={() => openSheet("journal")}
        >
          <span className="material-symbols-outlined text-sm">menu_book</span>
          Journal
        </button>
      </div>
    </div>
  );
}
