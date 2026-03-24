"use client";

import { useCallback, useState } from "react";

import { GoldButton } from "@/components/ui/gold-button";
import { useGameStore } from "@/lib/state/game-store";

const CHIPS = [
  "Attack",
  "Spell",
  "Talk",
  "Inspect",
  "Move",
  "Item",
] as const;

const CHIP_TEXT: Record<(typeof CHIPS)[number], string> = {
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

  const sheetBtn =
    "min-h-[44px] rounded-[var(--radius-chip)] border border-white/12 bg-[var(--color-midnight)]/90 px-3 text-sm text-[var(--color-silver-muted)] transition-colors hover:border-[var(--color-gold-support)]/25 active:scale-[0.98]";

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

  if (isMyTurn) {
    return (
      <div
        className={`glass-heavy glow-gold space-y-3 px-3 py-3 ${safeBottom}`}
      >
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            className={sheetBtn}
            onClick={() => openSheet("character")}
          >
            Character
          </button>
          <button
            type="button"
            className={sheetBtn}
            onClick={() => openSheet("party")}
          >
            Party
          </button>
          <button
            type="button"
            className={sheetBtn}
            onClick={() => openSheet("journal")}
          >
            Journal
          </button>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What do you do?"
          className="min-h-[44px] w-full rounded-[var(--radius-button)] border border-white/10 bg-[var(--color-deep-void)]/80 px-4 text-base text-[var(--color-silver-muted)] placeholder:text-[var(--color-silver-dim)] transition-[box-shadow,border-color] duration-[var(--duration-med)] focus:border-[var(--color-gold-rare)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-rare)]/40 focus:shadow-[0_0_0_1px_rgba(212,175,55,0.35),0_0_28px_rgba(212,175,55,0.22)]"
        />
        <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                setValue((v) => {
                  const insert = CHIP_TEXT[c];
                  if (!v.trim()) return insert;
                  return `${v.trim()} ${insert}`;
                })
              }
              className="min-h-[44px] shrink-0 rounded-[var(--radius-chip)] border border-white/12 bg-[var(--color-midnight)]/90 px-4 text-sm text-[var(--color-silver-muted)] transition-colors hover:border-[var(--color-gold-support)]/25 active:scale-[0.98]"
            >
              {c}
            </button>
          ))}
        </div>
        <GoldButton
          type="button"
          size="lg"
          className="min-h-[48px] w-full font-bold shadow-[0_0_32px_rgba(212,175,55,0.32)] ring-1 ring-[var(--color-gold-rare)]/30"
          onClick={() => void submit()}
          disabled={!value.trim() || busy}
        >
          {busy ? "…" : "Roll + Confirm"}
        </GoldButton>
      </div>
    );
  }

  const name = currentPlayerName ?? "another player";

  return (
    <div className={`glass-heavy space-y-3 px-3 py-3 ${safeBottom}`}>
      <p className="text-center text-sm text-[var(--color-silver-dim)]">
        Watching {name}&apos;s turn…
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className={sheetBtn}
          onClick={() => openSheet("character")}
        >
          Character
        </button>
        <button
          type="button"
          className={sheetBtn}
          onClick={() => openSheet("party")}
        >
          Party
        </button>
        <button
          type="button"
          className={sheetBtn}
          onClick={() => openSheet("journal")}
        >
          Journal
        </button>
      </div>
    </div>
  );
}
