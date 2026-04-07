"use client";

import { useCallback, useMemo, useState } from "react";

import { isChapterTurnCapExceeded } from "@/lib/chapter/chapter-config";
import {
  isQuestFinaleThreshold,
  questProgressBarWidth,
  questProgressPrimaryLine,
} from "@/lib/quest-display";
import type {
  GamePlayerView,
  GameSessionView,
  QuestProgressView,
} from "@/lib/state/game-store";

const BETRAYAL_OUTCOME_OPTIONS = [
  {
    id: "betrayal_traitor_escapes",
    label: "Traitor escapes with prize",
  },
  {
    id: "betrayal_traitor_caught",
    label: "Traitor caught / subdued",
  },
  {
    id: "betrayal_party_negotiates",
    label: "Party negotiates a truce",
  },
] as const;

function formatBetrayalPhase(phase: string | undefined): string {
  switch (phase) {
    case "rogue_intent":
      return "Rogue intent";
    case "confronting":
      return "Confrontation";
    case "resolved":
      return "Resolved";
    default:
      return "Idle";
  }
}

function BetrayalStoryOnlyPanel(props: {
  session: GameSessionView;
  quest: QuestProgressView;
  players: GamePlayerView[];
  sessionId: string;
  isHost: boolean;
  onSessionMutated: () => Promise<void>;
}) {
  const { session, quest, players, sessionId, isHost, onSessionMutated } =
    props;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [traitorPick, setTraitorPick] = useState("");

  const phase = quest.betrayal?.phase ?? "idle";
  const effectiveTraitor = traitorPick.trim();

  const run = useCallback(
    async (label: string, fn: () => Promise<Response>) => {
      setErr(null);
      setBusy(label);
      try {
        const res = await fn();
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? `Request failed (${res.status})`);
          return;
        }
        await onSessionMutated();
      } catch {
        setErr("Network error");
      } finally {
        setBusy(null);
      }
    },
    [onSessionMutated],
  );

  const postOutcome = useCallback(
    (outcomeId: string) =>
      run(`outcome:${outcomeId}`, () =>
        fetch(`/api/sessions/${sessionId}/betrayal/apply-outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcomeId,
            ...(effectiveTraitor
              ? { traitorPlayerId: effectiveTraitor }
              : { traitorPlayerId: null }),
          }),
        }),
      ),
    [effectiveTraitor, run, sessionId],
  );

  const postReset = useCallback(
    () =>
      run("phase:idle", () =>
        fetch(`/api/sessions/${sessionId}/betrayal/phase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPhase: "idle" }),
        }),
      ),
    [run, sessionId],
  );

  if (
    session.betrayalMode !== "story_only" ||
    session.gameKind !== "campaign" ||
    session.status !== "active" ||
    !isHost
  ) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/25 bg-[var(--color-deep-void)]/50 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-rare)]">
        Betrayal — story only
      </p>
      <p className="mt-1 text-[9px] text-[var(--outline)] leading-snug">
        Host registers a table outcome; narration and quest state update immediately. Use
        reset after a beat to set up another.
      </p>
      {err ? (
        <p className="mt-1.5 text-[10px] text-[var(--color-failure)]">{err}</p>
      ) : null}

      {phase !== "idle" ? (
        <div className="mt-2 space-y-2">
          <p className="text-[10px] font-bold text-[var(--color-silver-muted)]">
            Beat: {formatBetrayalPhase(phase)}
          </p>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void postReset()}
            className="min-h-[38px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui)] text-[9px] font-bold uppercase tracking-wider text-[var(--outline)] disabled:opacity-30"
          >
            {busy === "phase:idle" ? "Resetting…" : "Reset betrayal arc"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t border-[var(--border-ui)]/50 pt-3">
          <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
            Traitor / betrayer (optional)
            <select
              value={traitorPick}
              onChange={(e) => setTraitorPick(e.target.value)}
              className="mt-1 min-h-[40px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--color-deep-void)] px-2 text-[11px] text-[var(--color-silver-muted)]"
            >
              <option value="">Unspecified</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.character?.name || p.displayName || `Seat ${p.seatIndex + 1}`).slice(0, 48)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            {BETRAYAL_OUTCOME_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void postOutcome(o.id)}
                className="min-h-[38px] w-full rounded-[var(--radius-card)] bg-[var(--color-gold-rare)]/10 text-left px-2 text-[10px] font-bold text-[var(--color-silver-muted)] border border-[var(--color-gold-rare)]/25 disabled:opacity-30"
              >
                {busy === `outcome:${o.id}` ? "Applying…" : o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BetrayalConfrontationPanel(props: {
  session: GameSessionView;
  quest: QuestProgressView;
  players: GamePlayerView[];
  sessionId: string;
  currentPlayerId: string | null;
  isHost: boolean;
  onSessionMutated: () => Promise<void>;
}) {
  const {
    session,
    quest,
    players,
    sessionId,
    currentPlayerId,
    isHost,
    onSessionMutated,
  } = props;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hostRogueTarget, setHostRogueTarget] = useState<string>("");

  const phase = quest.betrayal?.phase ?? "idle";
  const instigatorId = quest.betrayal?.instigator_player_id ?? null;

  const instigatorName = useMemo(() => {
    if (!instigatorId) return null;
    const p = players.find((x) => x.id === instigatorId);
    return (
      p?.character?.name?.trim() ||
      p?.displayName?.trim() ||
      `Player ${(p?.seatIndex ?? 0) + 1}`
    );
  }, [instigatorId, players]);

  const [traitorPick, setTraitorPick] = useState<string>("");

  const effectiveTraitor = traitorPick || instigatorId || "";

  const run = useCallback(
    async (label: string, fn: () => Promise<Response>) => {
      setErr(null);
      setBusy(label);
      try {
        const res = await fn();
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? `Request failed (${res.status})`);
          return;
        }
        await onSessionMutated();
      } catch {
        setErr("Network error");
      } finally {
        setBusy(null);
      }
    },
    [onSessionMutated],
  );

  const postPhase = useCallback(
    (
      targetPhase: "rogue_intent" | "confronting" | "idle",
      instigatorPlayerId?: string | null,
    ) =>
      run(`phase:${targetPhase}`, () =>
        fetch(`/api/sessions/${sessionId}/betrayal/phase`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetPhase,
            ...(instigatorPlayerId !== undefined
              ? { instigatorPlayerId }
              : {}),
          }),
        }),
      ),
    [run, sessionId],
  );

  const postOutcome = useCallback(
    (outcomeId: string) =>
      run(`outcome:${outcomeId}`, () =>
        fetch(`/api/sessions/${sessionId}/betrayal/apply-outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outcomeId,
            ...(effectiveTraitor
              ? { traitorPlayerId: effectiveTraitor }
              : { traitorPlayerId: null }),
          }),
        }),
      ),
    [effectiveTraitor, run, sessionId],
  );

  if (
    session.betrayalMode !== "confrontational" ||
    session.gameKind !== "campaign" ||
    session.status !== "active"
  ) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-failure)]/25 bg-[var(--color-deep-void)]/50 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-failure)]">
        Betrayal — confrontational
      </p>
      <p className="mt-1 text-[10px] font-bold text-[var(--color-silver-muted)]">
        Beat: {formatBetrayalPhase(phase)}
        {instigatorName ? (
          <span className="block text-[9px] font-medium text-[var(--outline)] mt-0.5">
            Instigator: {instigatorName}
          </span>
        ) : null}
      </p>
      {err ? (
        <p className="mt-1.5 text-[10px] text-[var(--color-failure)]">{err}</p>
      ) : null}

      {phase === "idle" && currentPlayerId ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() =>
            void postPhase("rogue_intent", currentPlayerId)
          }
          className="mt-2 min-h-[40px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-high)] text-[10px] font-black uppercase tracking-wider text-[var(--color-silver-muted)] disabled:opacity-30"
        >
          {busy === "phase:rogue_intent"
            ? "Declaring…"
            : "Declare rogue intent (you)"}
        </button>
      ) : null}

      {isHost && phase === "idle" && players.length > 0 ? (
        <div className="mt-2 space-y-1.5 rounded-[var(--radius-card)] border border-[var(--border-ui)]/60 bg-[var(--surface-high)]/30 px-2 py-2">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
            Host: declare for a seat
          </p>
          <select
            value={hostRogueTarget}
            onChange={(e) => setHostRogueTarget(e.target.value)}
            className="min-h-[36px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--color-deep-void)] px-2 text-[11px] text-[var(--color-silver-muted)]"
          >
            <option value="">Choose player…</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {(p.character?.name || p.displayName || `Seat ${p.seatIndex + 1}`).slice(0, 48)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={Boolean(busy) || !hostRogueTarget}
            onClick={() => void postPhase("rogue_intent", hostRogueTarget)}
            className="min-h-[36px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-high)] text-[9px] font-black uppercase tracking-wider text-[var(--color-silver-muted)] disabled:opacity-30"
          >
            {busy === "phase:rogue_intent"
              ? "Declaring…"
              : "Declare rogue intent for selected player"}
          </button>
        </div>
      ) : null}

      {isHost && phase === "idle" ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void postPhase("confronting")}
          className="mt-2 min-h-[40px] w-full rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/40 bg-[var(--color-deep-void)] text-[10px] font-black uppercase tracking-wider text-[var(--color-gold-rare)] disabled:opacity-30"
        >
          {busy === "phase:confronting"
            ? "Opening…"
            : "Open confrontation (skip declare)"}
        </button>
      ) : null}

      {isHost && phase === "rogue_intent" ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void postPhase("confronting")}
          className="mt-2 min-h-[40px] w-full rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/40 bg-[var(--color-deep-void)] text-[10px] font-black uppercase tracking-wider text-[var(--color-gold-rare)] disabled:opacity-30"
        >
          {busy === "phase:confronting"
            ? "Opening…"
            : "Lock in confrontation beat"}
        </button>
      ) : null}

      {phase === "confronting" && !isHost ? (
        <p className="mt-2 text-[10px] text-[var(--outline)] leading-snug">
          Confrontation is live — the host will pick how this beat resolves.
        </p>
      ) : null}

      {isHost && (phase === "confronting" || phase === "idle") ? (
        <div className="mt-3 space-y-2 border-t border-[var(--border-ui)]/50 pt-3">
          <label className="block text-[9px] font-bold uppercase tracking-wider text-[var(--outline)]">
            Traitor / betrayer (player seat)
            <select
              value={effectiveTraitor}
              onChange={(e) => setTraitorPick(e.target.value)}
              className="mt-1 min-h-[40px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--color-deep-void)] px-2 text-[11px] text-[var(--color-silver-muted)]"
            >
              <option value="">Default (instigator if any)</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.character?.name || p.displayName || `Seat ${p.seatIndex + 1}`).slice(0, 48)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[9px] text-[var(--outline)] leading-snug">
            Host applies a table outcome. Narration should reflect the beat you choose.
          </p>
          <div className="flex flex-col gap-1.5">
            {BETRAYAL_OUTCOME_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void postOutcome(o.id)}
                className="min-h-[38px] w-full rounded-[var(--radius-card)] bg-[var(--color-failure)]/15 text-left px-2 text-[10px] font-bold text-[var(--color-silver-muted)] border border-[var(--color-failure)]/20 disabled:opacity-30"
              >
                {busy === `outcome:${o.id}` ? "Applying…" : o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isHost && (phase === "resolved" || phase === "confronting") ? (
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void postPhase("idle")}
          className="mt-2 min-h-[38px] w-full rounded-[var(--radius-card)] border border-[var(--border-ui)] text-[9px] font-bold uppercase tracking-wider text-[var(--outline)] disabled:opacity-30"
        >
          {busy === "phase:idle" ? "Resetting…" : "Reset betrayal arc"}
        </button>
      ) : null}
    </div>
  );
}

function dangerLabel(risk: number): { label: string; color: string } {
  if (risk >= 86) return { label: "Critical", color: "var(--gradient-hp-end)" };
  if (risk >= 61) return { label: "Perilous", color: "#e07c3a" };
  if (risk >= 31) return { label: "Uneasy", color: "var(--color-gold-rare)" };
  return { label: "Calm", color: "var(--color-silver-dim)" };
}

export interface QuestPillProps {
  quest: QuestProgressView;
  session: GameSessionView | null;
  currentPlayerId: string | null;
  voteBusy: boolean;
  chapterBusy: boolean;
  /** Host-only: advance chapter window + recap. */
  chapterContinueBusy?: boolean;
  isHost?: boolean;
  onContinueChapter?: () => void;
  onEndingVote: (choice: "end_now" | "continue") => void;
  onGenerateFinalChapter: () => void;
  /** Campaign session id — enables betrayal Phase B UI when set. */
  sessionId?: string | null;
  players?: GamePlayerView[];
  /** Refetch `/state` after betrayal API calls. */
  onSessionMutated?: () => Promise<void>;
}

function liveLeadAgeText(updatedRound: number, currentRound: number): string {
  const age = Math.max(0, currentRound - updatedRound);
  if (age <= 0) return "updated now";
  if (age === 1) return "1 round ago";
  return `${age} rounds ago`;
}

export function QuestPill({
  quest,
  session,
  currentPlayerId,
  voteBusy,
  chapterBusy,
  chapterContinueBusy = false,
  isHost = false,
  onContinueChapter,
  onEndingVote,
  onGenerateFinalChapter,
  sessionId = null,
  players = [],
  onSessionMutated,
}: QuestPillProps) {
  const risk = dangerLabel(quest.risk);
  const finaleThreshold = isQuestFinaleThreshold(quest);
  const barWidth = questProgressBarWidth(quest);
  const primaryProgress = questProgressPrimaryLine(quest);

  const currentRound = session?.currentRound ?? 1;
  const chapterTurnCapHit =
    session?.gameKind === "campaign" &&
    session.mode === "ai_dm" &&
    isChapterTurnCapExceeded({
      currentRound: session.currentRound,
      chapterStartRound: session.chapterStartRound ?? 1,
      chapterMaxTurns: session.chapterMaxTurns ?? 30,
    });
  const chapterBreakOffered =
    session?.gameKind === "campaign" &&
    session.mode === "ai_dm" &&
    session.chapterBreakOffered === true;
  const showContinueChapter =
    Boolean(isHost && onContinueChapter) &&
    session?.gameKind === "campaign" &&
    session.status === "active" &&
    (session.mode === "human_dm" ||
      chapterTurnCapHit ||
      chapterBreakOffered);
  const liveLeads = useMemo(
    () =>
      (quest.objectiveLeads ?? [])
        .slice()
        .sort((a, b) => {
          if (b.updatedRound !== a.updatedRound) {
            return b.updatedRound - a.updatedRound;
          }
          return b.confidence - a.confidence;
        })
        .slice(0, 3),
    [quest.objectiveLeads],
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-fantasy text-sm font-bold leading-snug text-[var(--color-silver-muted)]">
          {quest.objective}
        </p>
        <p className="mt-1 text-[9px] leading-snug text-[var(--outline)]">
          Progress is <span className="font-bold text-[var(--color-silver-dim)]">mission momentum</span> from
          dice and actions — not the same as reaching a place in the story.
        </p>
      </div>
      {session?.gameKind === "campaign" && session.status === "active" ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-high)]/40 px-3 py-2">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[var(--color-gold-rare)]">
            Chapter {session.chapterIndex ?? 1}
          </p>
          <p className="mt-1 text-[10px] font-bold text-[var(--outline)]">
            {session.chapterTurnsElapsed ?? 1} / {session.chapterMaxTurns ?? 30}{" "}
            turns · {session.chapterImagesUsed ?? 0} /{" "}
            {session.chapterImageBudget ?? 3} scene images
            {session.visualRhythmPreset ? (
              <span className="ml-1 text-[9px] uppercase tracking-wider text-[var(--outline)]">
                · {session.visualRhythmPreset}
              </span>
            ) : null}
          </p>
          {chapterTurnCapHit ? (
            <p className="mt-1.5 text-[10px] font-bold text-[var(--color-failure)]">
              Turn limit reached — continue the chapter so the table can keep taking
              turns.
            </p>
          ) : null}
          {chapterBreakOffered && session.mode === "ai_dm" ? (
            <p className="mt-1.5 text-[10px] font-bold text-[var(--color-silver-muted)] leading-snug">
              The narration marked a natural chapter break — open the next chapter when
              the table is ready.
            </p>
          ) : null}
          {session.mode === "human_dm" && isHost ? (
            <p className="mt-1.5 text-[10px] text-[var(--outline)] leading-snug">
              As human narrator, advance the chapter window when you move to a new act
              or scene budget.
            </p>
          ) : null}
          {showContinueChapter ? (
            <button
              type="button"
              disabled={chapterContinueBusy}
              onClick={() => void onContinueChapter?.()}
              className="mt-2 min-h-[40px] w-full rounded-[var(--radius-card)] border border-[var(--color-gold-rare)]/35 bg-[var(--color-deep-void)] text-[10px] font-black uppercase tracking-wider text-[var(--color-gold-rare)] disabled:opacity-30"
            >
              {chapterContinueBusy ? "Continuing…" : "Continue chapter"}
            </button>
          ) : null}
        </div>
      ) : null}
      {session && sessionId && onSessionMutated ? (
        <>
          <BetrayalStoryOnlyPanel
            session={session}
            quest={quest}
            players={players}
            sessionId={sessionId}
            isHost={isHost}
            onSessionMutated={onSessionMutated}
          />
          {session.betrayalMode === "confrontational" ? (
            <BetrayalConfrontationPanel
              session={session}
              quest={quest}
              players={players}
              sessionId={sessionId}
              currentPlayerId={currentPlayerId}
              isHost={isHost}
              onSessionMutated={onSessionMutated}
            />
          ) : null}
        </>
      ) : null}
      {liveLeads.length > 0 ? (
        <div className="rounded-[var(--radius-card)] bg-[var(--color-deep-void)]/40 px-3 py-2">
          <p className="text-[10px] font-bold text-[var(--outline)] uppercase tracking-wider">
            Live leads ({liveLeads.length})
          </p>
          <ul className="mt-2 ml-2 space-y-1.5 text-[10px] text-[var(--outline)]">
            {liveLeads.map((lead) => (
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
                    ({Math.round(lead.confidence * 100)}% ·{" "}
                    {liveLeadAgeText(lead.updatedRound, currentRound)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
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
      {quest.progress >= 100 && session?.status === "active" ? (
        <p className="text-[9px] leading-snug text-[var(--outline)]">
          100% means the table <span className="font-bold text-[var(--color-silver-dim)]">may</span> end the
          adventure — narration can still get darker or messier until you vote or keep playing.
        </p>
      ) : null}
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
              className="min-h-[40px] flex-1 rounded-[var(--radius-card)] border border-[var(--border-ui)] bg-[var(--surface-high)] text-[10px] font-black uppercase tracking-wider text-[var(--color-silver-muted)] disabled:opacity-30"
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
  );
}

export interface QuestDockProps {
  quest: QuestProgressView;
  onOpen: () => void;
}

export function QuestDock({ quest, onOpen }: QuestDockProps) {
  const risk = dangerLabel(quest.risk);
  const finaleThreshold = isQuestFinaleThreshold(quest);
  const progressHint = useMemo(() => {
    if (quest.status === "failed") return `${quest.progress}%`;
    if (finaleThreshold) return "Finale arc";
    return `${quest.progress}%`;
  }, [quest.status, quest.progress, finaleThreshold]);
  const statusLabel = useMemo(() => {
    if (quest.status === "ready_to_end") return "Vote open";
    if (quest.status === "failed") return "Failed";
    return "Active";
  }, [quest.status]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[var(--radius-card)] border border-[var(--border-ui-strong)] bg-[var(--surface-container)]/90 px-3 py-2 text-left backdrop-blur-sm"
      aria-label="Open quest details"
    >
      <div className="flex items-center gap-2">
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
          <p className="mt-0.5 line-clamp-2 text-[8px] font-medium normal-case tracking-normal text-[var(--outline)]">
            Momentum from play, not map position.
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
      </div>
    </button>
  );
}

export function QuestSheet(props: QuestPillProps) {
  return <QuestPill {...props} />;
}
