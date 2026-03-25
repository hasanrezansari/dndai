"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";

import type { FeedEntry, StatEffect } from "@/lib/state/game-store";

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
    return "border-l-[var(--color-silver-dim)]";
  }
  if (detail === "failure" || detail === "critical_failure") {
    return "border-l-[var(--color-failure)]";
  }
  return "border-l-[var(--color-gold-rare)]";
}

function diceResultColor(detail?: string) {
  if (!detail || !ROLL_RESULTS.has(detail)) {
    return "text-[var(--color-silver-dim)]";
  }
  if (detail === "failure" || detail === "critical_failure") {
    return "text-[var(--color-failure)]";
  }
  return "text-[var(--color-gold-rare)]";
}

function entryIcon(type: string): string {
  switch (type) {
    case "action":
      return "swords";
    case "narration":
      return "auto_stories";
    case "dice":
      return "casino";
    case "stat_change":
      return "vital_signs";
    case "system":
      return "info";
    default:
      return "notes";
  }
}

function StatEffectChip({ effect }: { effect: StatEffect }) {
  const chips: { label: string; cls: string }[] = [];
  if (effect.hpDelta !== 0) {
    const sign = effect.hpDelta > 0 ? "+" : "";
    chips.push({
      label: `${sign}${effect.hpDelta} HP`,
      cls: effect.hpDelta > 0 ? "text-emerald-400" : "text-red-400",
    });
  }
  if (effect.manaDelta !== 0) {
    const sign = effect.manaDelta > 0 ? "+" : "";
    chips.push({
      label: `${sign}${effect.manaDelta} MP`,
      cls: effect.manaDelta > 0 ? "text-blue-400" : "text-red-400",
    });
  }
  for (const c of effect.conditionsAdd) {
    chips.push({ label: `+${c}`, cls: "text-amber-400" });
  }
  for (const c of effect.conditionsRemove) {
    chips.push({ label: `-${c}`, cls: "text-[var(--outline)]" });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] font-bold text-[var(--color-silver-muted)]">
        {effect.targetName}
      </span>
      {chips.map((ch, i) => (
        <span
          key={i}
          className={`rounded-md bg-[var(--color-deep-void)] px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${ch.cls}`}
        >
          {ch.label}
        </span>
      ))}
      {effect.reasoning && (
        <span className="text-[10px] text-[var(--outline)] italic">
          {effect.reasoning}
        </span>
      )}
    </div>
  );
}

const timeClass =
  "shrink-0 self-start text-right text-[9px] leading-none text-[var(--outline)] tabular-nums font-mono";

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
        className="relative flex min-h-[2rem] items-center justify-center px-3 py-2"
      >
        <p className="text-center text-[11px] text-[var(--outline)] flex items-center gap-2">
          <span className="material-symbols-outlined text-xs">info</span>
          {entry.text}
        </p>
        <time className={`${timeClass} absolute right-1 top-1`} dateTime={entry.timestamp}>
          {time}
        </time>
      </motion.div>
    );
  }

  const borderBase =
    "rounded-[var(--radius-card)] border-l-[3px] pl-4 pr-3 py-3";

  if (entry.type === "action") {
    return (
      <motion.div
        layout={false}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`${borderBase} border-l-[var(--color-gold-support)] bg-[var(--surface-container)]/40 ${
          entry.highlight
            ? "bg-[var(--color-gold-rare)]/5"
            : ""
        }`}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            {entry.playerName && (
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[var(--color-gold-support)] text-sm">
                  {entryIcon(entry.type)}
                </span>
                <p className="text-[13px] font-bold text-[var(--color-silver-muted)]">
                  {entry.playerName}
                </p>
              </div>
            )}
            <p className="text-[14px] leading-relaxed text-[var(--color-silver-muted)]">
              {entry.text}
            </p>
            {entry.detail && (
              <p className="mt-1.5 text-[11px] text-[var(--outline)]">
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="material-symbols-outlined text-[var(--outline)] text-sm">
            casino
          </span>
          <p className="text-[14px] leading-snug text-[var(--color-silver-muted)] font-mono">
            {parsed.label}: {parsed.roll} + {parsed.mod} ={" "}
            <span className="font-black">{parsed.total}</span>
            <span className="text-[var(--outline)]"> — </span>
            <span className={`font-bold ${diceResultColor(entry.detail)}`}>
              {humanizeResult(entry.detail!)}
            </span>
          </p>
        </div>
      );
    } else if (parsed) {
      body = (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--outline)] text-sm">
            casino
          </span>
          <p className="text-[14px] leading-snug text-[var(--color-silver-muted)] font-mono">
            {parsed.label}: {parsed.roll} + {parsed.mod} ={" "}
            <span className="font-black">{parsed.total}</span>
          </p>
        </div>
      );
    } else {
      body = (
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[var(--outline)] text-sm">
            casino
          </span>
          <p className="text-[14px] leading-snug text-[var(--color-silver-muted)]">
            {entry.text}
            {entry.detail && !ROLL_RESULTS.has(entry.detail) && (
              <>
                <span className="text-[var(--outline)]"> · </span>
                <span className="text-[var(--outline)]">
                  {entry.detail}
                </span>
              </>
            )}
          </p>
        </div>
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

  if (entry.type === "stat_change" && entry.statEffects?.length) {
    return (
      <motion.div
        layout={false}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`${borderBase} border-l-red-500/60 bg-[var(--surface-container)]/30`}
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-red-400 text-sm">
                vital_signs
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--outline)]">
                Stat Changes
              </span>
            </div>
            {entry.statEffects.map((eff, i) => (
              <StatEffectChip key={i} effect={eff} />
            ))}
          </div>
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
        className={`${borderBase} border-l-[var(--atmosphere-mystery)] bg-[var(--surface-container)]/20 py-4 pl-4 pr-3`}
      >
        {entry.imageUrl && (
          <div className="mb-3 overflow-hidden rounded-[var(--radius-card)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.imageUrl}
              alt=""
              loading="eager"
              className="h-auto w-full object-cover"
              style={{ aspectRatio: "16/9" }}
            />
          </div>
        )}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-fantasy text-[15px] italic leading-relaxed text-[var(--color-silver-muted)]">
              {entry.text}
            </p>
            {entry.detail && (
              <p className="mt-2 text-[11px] text-[var(--outline)]">
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
      className={`${borderBase} border-l-[var(--outline-variant)] bg-transparent py-2 opacity-70`}
    >
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-snug text-[var(--outline)]">
            {entry.text}
          </p>
          {entry.detail && (
            <p className="mt-0.5 text-[11px] text-[var(--outline)] opacity-60">
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
