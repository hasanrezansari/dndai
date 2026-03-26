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

/** Round-summary narrations store `detail` as "Round N" (see use-session-channel). */
const ROUND_DETAIL = /^Round \d+$/;

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

function avatarLetter(name?: string) {
  const n = name?.trim();
  if (n && n.length > 0) return n[0]!.toUpperCase();
  return "?";
}

function StatEffectRow({ effect }: { effect: StatEffect }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] bg-[var(--color-deep-void)]/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-fantasy text-xs font-bold tracking-tight text-[var(--color-silver-muted)]">
          {effect.targetName}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {effect.hpDelta !== 0 ? (
          <div
            className={`flex items-center justify-between gap-2 text-data text-sm font-black tabular-nums ${
              effect.hpDelta > 0
                ? "text-[var(--color-success)]"
                : "text-[var(--color-failure)]"
            }`}
          >
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)]">
              <span className="material-symbols-outlined text-base" aria-hidden>
                {effect.hpDelta > 0 ? "trending_up" : "trending_down"}
              </span>
              HP
            </span>
            <span>
              {effect.hpDelta > 0 ? "+" : ""}
              {effect.hpDelta}
            </span>
          </div>
        ) : null}
        {effect.manaDelta !== 0 ? (
          <div
            className={`flex items-center justify-between gap-2 text-data text-sm font-black tabular-nums ${
              effect.manaDelta > 0
                ? "text-[var(--gradient-mana-end)]"
                : "text-[var(--color-failure)]"
            }`}
          >
            <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[var(--outline)]">
              <span className="material-symbols-outlined text-base" aria-hidden>
                {effect.manaDelta > 0 ? "trending_up" : "trending_down"}
              </span>
              Mana
            </span>
            <span>
              {effect.manaDelta > 0 ? "+" : ""}
              {effect.manaDelta}
            </span>
          </div>
        ) : null}
        {(effect.conditionsAdd.length > 0 ||
          effect.conditionsRemove.length > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {effect.conditionsAdd.map((c) => (
              <span
                key={`add-${c}`}
                className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-gold-support)]/25 bg-[var(--surface-high)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-gold-rare)]"
              >
                <span className="material-symbols-outlined text-[12px]" aria-hidden>
                  add_circle
                </span>
                {c}
              </span>
            ))}
            {effect.conditionsRemove.map((c) => (
              <span
                key={`rm-${c}`}
                className="inline-flex items-center gap-0.5 rounded-md border border-[var(--outline)]/20 bg-[var(--surface-container)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--outline)]"
              >
                <span className="material-symbols-outlined text-[12px]" aria-hidden>
                  remove_circle
                </span>
                {c}
              </span>
            ))}
          </div>
        )}
        {effect.reasoning ? (
          <p className="text-[10px] italic leading-snug text-[var(--outline)]">
            {effect.reasoning}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const timeClass =
  "shrink-0 text-right text-[9px] leading-none text-[var(--outline)] tabular-nums font-mono";

const motionProps = {
  layout: false as const,
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
};

export interface FeedEntryRowProps {
  entry: FeedEntry;
}

export function FeedEntryRow({ entry }: FeedEntryRowProps) {
  const time = formatTime(entry.timestamp);

  if (entry.type === "system") {
    return (
      <motion.div {...motionProps} className="relative px-1 py-3">
        <div
          className="border-y border-[rgba(77,70,53,0.35)] py-3"
          role="status"
        >
          <p className="text-center text-[11px] leading-relaxed text-[var(--outline)] flex items-center justify-center gap-2 px-6">
            <span className="material-symbols-outlined text-sm text-[var(--color-gold-support)]/80">
              info
            </span>
            {entry.text}
          </p>
        </div>
        <time
          className={`${timeClass} absolute right-1 top-1`}
          dateTime={entry.timestamp}
        >
          {time}
        </time>
      </motion.div>
    );
  }

  if (entry.type === "action") {
    const highlighted = Boolean(entry.highlight);
    return (
      <motion.div
        {...motionProps}
        className={`rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.22)] bg-[var(--surface-container)]/55 pl-3 pr-3 py-3 backdrop-blur-sm ${
          highlighted ? "feed-entry-action-highlight" : ""
        }`}
      >
        <div className="flex gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-avatar)] text-sm font-black ${
              highlighted
                ? "selected-glow border-2 border-[var(--color-gold-rare)] bg-[var(--surface-high)] text-[var(--color-gold-rare)]"
                : "border border-[rgba(77,70,53,0.25)] bg-[var(--color-midnight)] text-[var(--color-silver-dim)]"
            }`}
            aria-hidden
          >
            {avatarLetter(entry.playerName)}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {entry.playerName ? (
              <p className="text-fantasy text-[13px] font-bold text-[var(--color-gold-rare)]">
                {entry.playerName}
              </p>
            ) : null}
            <div className="relative mt-2 pl-1">
              <span
                className="text-fantasy pointer-events-none absolute -left-0.5 top-0 text-3xl leading-none text-[var(--color-gold-support)]/35"
                aria-hidden
              >
                &ldquo;
              </span>
              <p className="text-[15px] leading-relaxed text-[var(--color-silver-muted)] pl-3">
                {entry.text}
              </p>
            </div>
            {entry.detail ? (
              <p className="mt-2 pl-3 text-[10px] uppercase tracking-[0.12em] text-[var(--outline)]">
                {entry.detail}
              </p>
            ) : null}
          </div>
          <time className={`${timeClass} shrink-0 pt-0.5`} dateTime={entry.timestamp}>
            {time}
          </time>
        </div>
      </motion.div>
    );
  }

  if (entry.type === "dice") {
    const parsed = parseDiceLine(entry.text);
    const isFinal = entry.detail && ROLL_RESULTS.has(entry.detail);
    const isCrit =
      entry.detail === "critical_success" ||
      entry.detail === "critical_failure";

    let body: ReactNode;
    if (isFinal && parsed) {
      body = (
        <div className="flex flex-col items-center gap-1 px-2 py-1 text-center">
          <span className="material-symbols-outlined text-[var(--outline)]/80 text-lg">
            casino
          </span>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--outline)]">
            {parsed.label}
          </p>
          <p
            className={`text-data text-2xl font-black tabular-nums text-[var(--color-silver-muted)] ${
              isCrit ? "animate-dice-critical-pop" : ""
            }`}
          >
            {parsed.total}
          </p>
          <p className="text-data text-xs text-[var(--color-silver-dim)]">
            {parsed.roll}
            <span className="text-[var(--outline)]"> + </span>
            {parsed.mod}
          </p>
          <span
            className={`mt-1 rounded-[var(--radius-pill)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] ${
              entry.detail === "failure" || entry.detail === "critical_failure"
                ? "bg-[color-mix(in_srgb,var(--color-failure)_18%,transparent)] text-[var(--color-failure)] ring-1 ring-[var(--color-failure)]/35"
                : "bg-[color-mix(in_srgb,var(--color-gold-rare)_14%,transparent)] text-[var(--color-gold-rare)] ring-1 ring-[var(--color-gold-rare)]/30"
            } ${entry.detail === "critical_success" || entry.detail === "critical_failure" ? "animate-pulse-glow" : ""}`}
          >
            {humanizeResult(entry.detail!)}
          </span>
        </div>
      );
    } else if (parsed) {
      body = (
        <div className="flex flex-col items-center gap-1 px-2 py-1 text-center">
          <span className="material-symbols-outlined text-[var(--outline)]/80 text-lg">
            casino
          </span>
          <p className="text-data text-sm text-[var(--color-silver-muted)]">
            {parsed.label}: {parsed.roll} + {parsed.mod} ={" "}
            <span className="font-black">{parsed.total}</span>
          </p>
        </div>
      );
    } else {
      body = (
        <div className="flex flex-col items-center gap-1 px-2 py-1 text-center">
          <span className="material-symbols-outlined text-[var(--outline)]/80 text-lg">
            casino
          </span>
          <p className="text-sm text-[var(--color-silver-muted)]">
            {entry.text}
            {entry.detail && !ROLL_RESULTS.has(entry.detail) ? (
              <span className="text-[var(--outline)]"> · {entry.detail}</span>
            ) : null}
          </p>
        </div>
      );
    }

    return (
      <motion.div
        {...motionProps}
        className="flex justify-center py-1"
        role="status"
      >
        <div className="w-full max-w-[min(100%,280px)] rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.28)] bg-[var(--color-deep-void)]/70 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm">
          {body}
          <time
            className={`${timeClass} block w-full px-3 pt-2 text-center`}
            dateTime={entry.timestamp}
          >
            {time}
          </time>
        </div>
      </motion.div>
    );
  }

  if (entry.type === "stat_change" && entry.statEffects?.length) {
    return (
      <motion.div
        {...motionProps}
        className="animate-feed-stat-reveal space-y-2 px-0.5 py-1"
        role="status"
      >
        <div className="flex items-center justify-center gap-2">
          <span className="h-px flex-1 max-w-[4rem] bg-gradient-to-r from-transparent to-[var(--color-failure)]/40" />
          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--color-failure)]">
            <span className="material-symbols-outlined text-sm">bolt</span>
            Fate shifts
          </span>
          <span className="h-px flex-1 max-w-[4rem] bg-gradient-to-l from-transparent to-[var(--color-failure)]/40" />
        </div>
        <div className="space-y-2">
          {entry.statEffects.map((eff, i) => (
            <StatEffectRow key={i} effect={eff} />
          ))}
        </div>
        <time
          className={`${timeClass} block text-center`}
          dateTime={entry.timestamp}
        >
          {time}
        </time>
      </motion.div>
    );
  }

  if (entry.type === "narration") {
    const isRoundBreak =
      Boolean(entry.detail) && ROUND_DETAIL.test(entry.detail!);

    if (isRoundBreak) {
      return (
        <motion.div {...motionProps} className="py-4">
          <div className="feed-entry-round-break flex items-center gap-3 px-1 py-2">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--color-gold-rare)]/35 to-transparent" />
            <span className="shrink-0 rounded-[var(--radius-pill)] border border-[var(--color-gold-rare)]/35 bg-[var(--color-deep-void)] px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] text-[var(--color-gold-rare)]">
              {entry.detail}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--color-gold-rare)]/35 to-transparent" />
          </div>
          <p className="text-fantasy mt-3 text-center text-[15px] font-semibold leading-relaxed text-[var(--color-silver-muted)]">
            {entry.text}
          </p>
          <time
            className={`${timeClass} mt-2 block text-center`}
            dateTime={entry.timestamp}
          >
            {time}
          </time>
        </motion.div>
      );
    }

    return (
      <motion.div
        {...motionProps}
        className="overflow-hidden rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.25)] feed-entry-narration-bg"
      >
        {entry.imageUrl ? (
          <div className="relative -mx-px -mt-px overflow-hidden border-b border-[rgba(77,70,53,0.2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.imageUrl}
              alt=""
              loading="eager"
              className="h-auto w-full object-cover"
              style={{ aspectRatio: "16/9" }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--surface-container)] via-transparent to-transparent" />
          </div>
        ) : null}

        <div className="relative px-4 pb-4 pt-4">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="h-px flex-1 max-w-[3rem] bg-gradient-to-r from-transparent to-[var(--color-gold-support)]/45" />
            <span className="material-symbols-outlined text-[var(--color-gold-rare)] text-sm">
              auto_stories
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--color-gold-support)]">
              Narration
            </span>
            <span className="h-px flex-1 max-w-[3rem] bg-gradient-to-l from-transparent to-[var(--color-gold-support)]/45" />
          </div>

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-fantasy animate-fade-in text-[16px] italic leading-relaxed text-[var(--color-silver-muted)]">
                {entry.text}
              </p>
              {entry.detail ? (
                <p className="mt-3 border-l-2 border-[var(--color-gold-support)]/40 pl-3 text-[11px] leading-snug text-[var(--outline)]">
                  <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-support)]/80">
                    World shifts
                  </span>
                  {entry.detail}
                </p>
              ) : null}
            </div>
            <time className={`${timeClass} shrink-0`} dateTime={entry.timestamp}>
              {time}
            </time>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      {...motionProps}
      className="rounded-[var(--radius-card)] border border-dashed border-[var(--outline-variant)]/50 bg-transparent py-2 opacity-75"
    >
      <div className="flex gap-2 px-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-snug text-[var(--outline)]">
            {entry.text}
          </p>
          {entry.detail ? (
            <p className="mt-0.5 text-[11px] text-[var(--outline)] opacity-60">
              {entry.detail}
            </p>
          ) : null}
        </div>
        <time className={`${timeClass} shrink-0 pt-0.5`} dateTime={entry.timestamp}>
          {time}
        </time>
      </div>
    </motion.div>
  );
}
