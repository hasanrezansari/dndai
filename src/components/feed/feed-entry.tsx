"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";

import type { FeedEntry } from "@/lib/state/game-store";

const ROLL_RESULTS = new Set([
  "success",
  "failure",
  "critical_success",
  "critical_failure",
]);

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function humanizeResult(r: string) {
  return r
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseDiceLine(text: string): {
  label: string;
  roll: string;
  mod: string;
  total: string;
} | null {
  const m = text.match(
    /^([^:]+):\s*(\d+)\s*\+\s*(-?\d+)\s*=\s*(\d+)\s*$/i,
  );
  if (!m) return null;
  return {
    label: m[1]!.trim(),
    roll: m[2]!,
    mod: m[3]!,
    total: m[4]!,
  };
}

function diceBorderClass(detail?: string) {
  if (!detail || !ROLL_RESULTS.has(detail)) {
    return "border-l-[var(--color-silver-muted)]";
  }
  if (detail === "failure" || detail === "critical_failure") {
    return "border-l-[var(--color-failure)]";
  }
  return "border-l-[var(--atmosphere-exploration)]";
}

function diceResultColor(detail?: string) {
  if (!detail || !ROLL_RESULTS.has(detail)) {
    return "text-[var(--color-silver-dim)]";
  }
  if (detail === "failure" || detail === "critical_failure") {
    return "text-[var(--gradient-hp-end)]";
  }
  return "text-[var(--atmosphere-exploration)]";
}

const timeClass =
  "text-data shrink-0 self-start text-right text-[10px] leading-none text-[var(--color-silver-dim)] tabular-nums";

export interface FeedEntryRowProps {
  entry: FeedEntry;
}

export function FeedEntryRow({ entry }: FeedEntryRowProps) {
  const time = formatTime(entry.timestamp);

  if (entry.type === "system") {
    return (
      <motion.div
        layout={false}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex min-h-[2rem] items-start justify-center px-2 py-1.5"
      >
        <p className="max-w-[min(100%,20rem)] text-center text-data text-[11px] leading-snug text-[var(--color-silver-dim)] opacity-60">
          {entry.text}
        </p>
        <time className={`${timeClass} absolute right-1 top-1`} dateTime={entry.timestamp}>
          {time}
        </time>
      </motion.div>
    );
  }

  const borderBase =
    "rounded-[var(--radius-chip)] border-l-[3px] pl-3 pr-2 py-2";

  if (entry.type === "action") {
    return (
      <motion.div
        layout={false}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`${borderBase} border-l-[var(--color-gold-support)] bg-[rgba(184,134,11,0.06)] ${
          entry.highlight
            ? "shadow-[inset_0_0_0_1px_rgba(212,175,55,0.12)]"
            : ""
        }`}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            {entry.playerName && (
              <p className="mb-0.5 text-[14px] font-bold leading-snug text-[var(--color-silver-muted)]">
                {entry.playerName}
              </p>
            )}
            <p className="text-[14px] leading-snug text-[var(--color-silver-muted)]">
              {entry.text}
            </p>
            {entry.detail && (
              <p className="text-data mt-1 text-xs text-[var(--color-silver-dim)]">
                {entry.detail}
              </p>
            )}
          </div>
          <time className={`${timeClass} pt-0.5`} dateTime={entry.timestamp}>
            {time}
          </time>
        </div>
      </motion.div>
    );
  }

  if (entry.type === "dice") {
    const parsed = parseDiceLine(entry.text);
    const isFinal = entry.detail && ROLL_RESULTS.has(entry.detail);
    const borderClass = diceBorderClass(isFinal ? entry.detail : undefined);

    let body: ReactNode;
    if (isFinal && parsed) {
      body = (
        <p className="text-data text-[14px] leading-snug text-[var(--color-silver-muted)]">
          <span aria-hidden>🎲 </span>
          {parsed.label}: {parsed.roll} + {parsed.mod} = {parsed.total}
          <span className="text-[var(--color-silver-dim)]"> — </span>
          <span className={`font-medium ${diceResultColor(entry.detail)}`}>
            {humanizeResult(entry.detail!)}
          </span>
        </p>
      );
    } else if (parsed) {
      body = (
        <p className="text-data text-[14px] leading-snug text-[var(--color-silver-muted)]">
          <span aria-hidden>🎲 </span>
          {parsed.label}: {parsed.roll} + {parsed.mod} = {parsed.total}
        </p>
      );
    } else {
      body = (
        <p className="text-data text-[14px] leading-snug text-[var(--color-silver-muted)]">
          <span aria-hidden>🎲 </span>
          {entry.text}
          {entry.detail && !ROLL_RESULTS.has(entry.detail) && (
            <>
              <span className="text-[var(--color-silver-dim)]"> · </span>
              <span className="text-[var(--color-silver-dim)]">
                {entry.detail}
              </span>
            </>
          )}
        </p>
      );
    }

    return (
      <motion.div
        layout={false}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`${borderBase} ${borderClass} bg-[var(--color-deep-void)]/40`}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">{body}</div>
          <time className={`${timeClass} pt-0.5`} dateTime={entry.timestamp}>
            {time}
          </time>
        </div>
      </motion.div>
    );
  }

  if (entry.type === "narration") {
    return (
      <motion.div
        layout={false}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`${borderBase} border-l-[var(--atmosphere-mystery)] bg-[var(--color-deep-void)]/25 py-3.5 pl-3.5 pr-2.5`}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-fantasy text-[15px] italic leading-relaxed text-[var(--color-silver-muted)]">
              {entry.text}
            </p>
            {entry.detail && (
              <p className="text-data mt-2 text-xs text-[var(--color-silver-dim)]">
                {entry.detail}
              </p>
            )}
          </div>
          <time className={`${timeClass} pt-1`} dateTime={entry.timestamp}>
            {time}
          </time>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout={false}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`${borderBase} border-l-[var(--color-silver-muted)] bg-transparent py-1.5 opacity-80`}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-data text-[12px] leading-snug text-[var(--color-silver-dim)]">
            {entry.text}
          </p>
          {entry.detail && (
            <p className="text-data mt-0.5 text-[11px] text-[var(--color-silver-dim)] opacity-80">
              {entry.detail}
            </p>
          )}
        </div>
        <time className={`${timeClass} pt-0.5`} dateTime={entry.timestamp}>
          {time}
        </time>
      </div>
    </motion.div>
  );
}
