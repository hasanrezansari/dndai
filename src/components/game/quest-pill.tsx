"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  isQuestFinaleThreshold,
  questProgressBarWidth,
  questProgressPrimaryLine,
} from "@/lib/quest-display";
import type { GameSessionView, QuestProgressView } from "@/lib/state/game-store";

function dangerLabel(risk: number): { label: string; color: string } {
  if (risk >= 86) return { label: "Critical", color: "var(--gradient-hp-end)" };
  if (risk >= 61) return { label: "Perilous", color: "#e07c3a" };
  if (risk >= 31) return { label: "Uneasy", color: "var(--color-gold-rare)" };
  return { label: "Calm", color: "var(--color-silver-dim)" };
}

function questSignature(q: QuestProgressView): string {
  return JSON.stringify({
    o: q.objective,
    p: q.progress,
    r: q.risk,
    s: q.status,
    n: q.subObjectives?.length ?? 0,
  });
}

export interface QuestPillProps {
  quest: QuestProgressView;
  session: GameSessionView | null;
  currentPlayerId: string | null;
  voteBusy: boolean;
  chapterBusy: boolean;
  onEndingVote: (choice: "end_now" | "continue") => void;
  onGenerateFinalChapter: () => void;
}

export function QuestPill({
  quest,
  session,
  currentPlayerId,
  voteBusy,
  chapterBusy,
  onEndingVote,
  onGenerateFinalChapter,
}: QuestPillProps) {
  const [expanded, setExpanded] = useState(false);
  const prevSig = useRef<string | null>(null);

  useEffect(() => {
    const sig = questSignature(quest);
    if (prevSig.current !== null && prevSig.current !== sig) {
      setExpanded(true);
    }
    prevSig.current = sig;
  }, [quest]);

  const risk = dangerLabel(quest.risk);
  const finaleThreshold = isQuestFinaleThreshold(quest);
  const barWidth = questProgressBarWidth(quest);
  const primaryProgress = questProgressPrimaryLine(quest);

  const progressHint = useMemo(() => {
    if (quest.status === "failed") return `${quest.progress}%`;
    if (finaleThreshold) return "High tension · signals & danger still matter";
    return `${quest.progress}%`;
  }, [quest.status, quest.progress, finaleThreshold]);

  const statusLabel = useMemo(() => {
    if (quest.status === "ready_to_end") return "Vote open";
    if (quest.status === "failed") return "Failed";
    return "Active";
  }, [quest.status]);

  return (
    <div className="shrink-0 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-container)]/50 px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 text-left min-h-[44px]"
        aria-expanded={expanded}
      >
        <span
          className="material-symbols-outlined shrink-0 text-[var(--color-gold-rare)] text-base"
          aria-hidden
        >
          flag
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-fantasy text-xs font-bold tracking-tight text-[var(--color-silver-muted)]">
            {quest.objective}
          </p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
            <span style={{ color: risk.color }}>{risk.label}</span>
            <span className="text-[var(--outline)]"> · </span>
            {progressHint}
          </p>
        </div>
        <span className="shrink-0 rounded-[var(--radius-chip)] bg-[var(--surface-high)] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--outline)]">
          {statusLabel}
        </span>
        <span
          className={`material-symbols-outlined shrink-0 text-[var(--outline)] text-lg transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        >
          expand_more
        </span>
      </button>

      {expanded ? (
        <div className="mt-2 space-y-3 border-t border-[rgba(77,70,53,0.12)] pt-3">
          {quest.objectiveLeads?.length ? (
            <details open className="rounded-[var(--radius-card)] bg-[var(--color-deep-void)]/40 px-3 py-2">
              <summary className="cursor-pointer text-[10px] font-bold text-[var(--outline)] select-none uppercase tracking-wider">
                Signals ({quest.objectiveLeads.length})
              </summary>
              <ul className="mt-2 ml-2 space-y-1.5 text-[10px] text-[var(--outline)]">
                {quest.objectiveLeads.map((lead) => (
                  <li key={lead.id} className="flex items-start gap-2">
                    <span
                      className="material-symbols-outlined mt-px shrink-0 text-[10px] text-[var(--color-gold-rare)]"
                      aria-hidden
                    >
                      explore
                    </span>
                    <span className="line-clamp-2">
                      {lead.text}
                      <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--outline)]">
                        ({Math.round(lead.confidence * 100)}%)
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {quest.subObjectives?.length ? (
            <details open className="rounded-[var(--radius-card)] bg-[var(--color-deep-void)]/40 px-3 py-2">
              <summary className="cursor-pointer text-[10px] font-bold text-[var(--outline)] select-none uppercase tracking-wider">
                Sub-objectives ({quest.subObjectives.length})
              </summary>
              <ul className="mt-2 ml-2 space-y-1 text-[10px] text-[var(--outline)]">
                {quest.subObjectives.map((sub, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className="material-symbols-outlined mt-px shrink-0 text-[10px] text-[var(--color-gold-rare)]"
                      aria-hidden
                    >
                      check_circle
                    </span>
                    <span className="line-clamp-2">{sub}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[var(--color-deep-void)]">
            <div
              className="h-full rounded-sm bg-gradient-to-r from-[var(--color-gold-support)] to-[var(--color-gold-rare)] transition-[width] duration-300"
              style={{
                width: `${barWidth}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider">
            <span className="text-[var(--outline)]">
              {finaleThreshold
                ? `${primaryProgress} · story goes on until the table votes or keeps playing`
                : `Progress ${primaryProgress}`}
            </span>
            <span style={{ color: risk.color }}>
              {risk.label} ({quest.risk}%)
            </span>
          </div>
          {quest.endingVote?.open && currentPlayerId ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/20 bg-[var(--surface-high)] p-3">
              <p className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-rare)]">
                <span className="material-symbols-outlined text-xs" aria-hidden>
                  how_to_vote
                </span>
                {quest.endingVote.reason === "party_defeated"
                  ? "Party Defeated"
                  : "Story threshold — end or continue?"}
              </p>
              <div className="mb-2 text-[10px] font-bold text-[var(--outline)]">
                {
                  Object.values(quest.endingVote.votes).filter(
                    (v) => v === "end_now",
                  ).length
                }
                /{quest.endingVote.requiredYes} votes needed
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={voteBusy}
                  onClick={() => onEndingVote("end_now")}
                  className="min-h-[40px] flex-1 rounded-[var(--radius-card)] bg-[var(--color-gold-rare)] text-[var(--color-obsidian)] text-[10px] font-black uppercase tracking-wider disabled:opacity-30"
                >
                  End Now
                </button>
                <button
                  type="button"
                  disabled={voteBusy}
                  onClick={() => onEndingVote("continue")}
                  className="min-h-[40px] flex-1 rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-high)] text-[10px] font-black uppercase tracking-wider text-[var(--color-silver-muted)] disabled:opacity-30"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : null}
          {session?.status === "ended" ? (
            <div>
              <button
                type="button"
                disabled={chapterBusy || session.finalChapterPublished}
                onClick={() => onGenerateFinalChapter()}
                className="min-h-[40px] w-full rounded-[var(--radius-card)] bg-gradient-to-b from-[var(--color-gold-rare)] to-[var(--color-gold-support)] text-[var(--color-obsidian)] text-[10px] font-black uppercase tracking-wider disabled:opacity-30 disabled:grayscale"
              >
                {session.finalChapterPublished
                  ? "Final Chapter Published"
                  : chapterBusy
                    ? "Publishing..."
                    : "Generate Final Chapter"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
