"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MAX_TURN_EXTENSIONS_PER_CHAPTER,
  TURN_EXTENSION_SEC,
  TURN_SOFT_WARN_SEC,
} from "@/lib/turn/timeout-config";

export interface TurnBannerProps {
  visible: boolean;
  /** ISO deadline from server (`currentTurnDeadlineAt`). */
  deadlineAt: string | null;
  /** Uses left this chapter for the viewing actor, or null. */
  extensionsRemaining: number | null;
  sessionId: string | null;
  playerId: string | null;
}

function formatRemain(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function TurnBanner({
  visible,
  deadlineAt,
  extensionsRemaining,
  sessionId,
  playerId,
}: TurnBannerProps) {
  const [now, setNow] = useState(() => Date.now());
  const [extendBusy, setExtendBusy] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!deadlineAt) return null;
    const end = new Date(deadlineAt).getTime();
    if (!Number.isFinite(end)) return null;
    return (end - now) / 1000;
  }, [deadlineAt, now]);

  const onExtend = useCallback(async () => {
    if (!sessionId || !playerId || extendBusy) return;
    if (extensionsRemaining === null || extensionsRemaining <= 0) return;
    setExtendBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/turn/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[TurnBanner] extend failed:", res.status, errText);
      }
    } finally {
      setExtendBusy(false);
    }
  }, [sessionId, playerId, extensionsRemaining, extendBusy]);

  if (!visible) return null;

  const warn =
    secondsLeft !== null &&
    secondsLeft <= TURN_SOFT_WARN_SEC &&
    secondsLeft > 0;
  const urgent =
    secondsLeft !== null && secondsLeft <= 10 && secondsLeft > 0;

  const showExtend =
    extensionsRemaining !== null &&
    extensionsRemaining > 0 &&
    Boolean(sessionId && playerId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mb-1 flex justify-center px-2"
    >
      <div
        className={`flex flex-wrap items-center justify-center gap-2 rounded-[var(--radius-card)] border px-4 py-2.5 shadow-[0_0_24px_rgba(242,202,80,0.15)] backdrop-blur-md ${
          urgent
            ? "border-red-500/55 bg-red-950/40"
            : warn
              ? "border-amber-500/45 bg-amber-950/35"
              : "border-[var(--color-gold-rare)]/30 bg-[var(--color-obsidian)]/90"
        }`}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <span
            className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            swords
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--color-gold-rare)]">
            Your Turn
          </span>
        </div>
        {secondsLeft !== null ? (
          <div
            className={`pointer-events-none min-w-[2.75rem] text-center font-mono text-xs font-bold tabular-nums ${
              urgent ? "text-red-200" : warn ? "text-amber-200" : "text-[var(--color-gold-support)]"
            }`}
            aria-live="polite"
          >
            {formatRemain(secondsLeft)}
            {warn ? (
              <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide opacity-90">
                {urgent ? "Hurry" : "Wrapping"}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="pointer-events-none text-[9px] text-[var(--color-gold-support)]/80">
            —
          </span>
        )}
        {showExtend ? (
          <button
            type="button"
            onClick={() => void onExtend()}
            disabled={extendBusy}
            className="rounded border border-[var(--color-gold-rare)]/40 bg-[var(--surface-high)]/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--color-gold-rare)] transition-colors hover:border-[var(--color-gold-rare)]/70 hover:bg-[var(--surface-high)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-rare)]/40 disabled:opacity-50"
          >
            {extendBusy
              ? "…"
              : `+${TURN_EXTENSION_SEC}s (${extensionsRemaining}/${MAX_TURN_EXTENSIONS_PER_CHAPTER})`}
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
