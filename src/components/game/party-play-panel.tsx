"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PartySessionCard } from "@/components/game/party-session-card";
import { BottomSheet } from "@/components/sheets/bottom-sheet";
import { GhostButton } from "@/components/ui/ghost-button";
import { GoldButton } from "@/components/ui/gold-button";
import { useToast } from "@/components/ui/toast";
import { isPartyBlockShownInScene } from "@/lib/party/party-ui-dedupe";
import type { PartyConfigClientView } from "@/lib/schemas/party";
import type { GamePlayerView } from "@/lib/state/game-store";

type Props = {
  sessionId: string;
  currentPlayerId: string | null;
  party: PartyConfigClientView;
  players: GamePlayerView[];
  /** Main Scene narrative from session state — used to hide duplicate carry / merged / recap text. */
  sceneNarrativeForDedupe?: string | null;
};

type PartyMeView = {
  secretRole: string | null;
  roleKey: string | null;
  bonusObjectives: Array<{ id: string; text: string; completed: boolean }>;
  secretBonusPoints: number;
  myCrowdVoteSlotId: string | null;
  mySubmittedTiebreak: boolean;
};

function PartyPhaseDeadline({ iso }: { iso: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!iso?.trim()) return null;
  const end = new Date(iso).getTime();
  const sec = Math.max(0, Math.ceil((end - now) / 1000));
  const mm = Math.floor(sec / 60);
  const ss = sec % 60;
  return (
    <p className="text-xs tabular-nums text-[var(--color-gold-rare)]/90">
      Time left: {mm}:{ss.toString().padStart(2, "0")}
    </p>
  );
}

function labelForPlayer(players: GamePlayerView[], playerId: string): string {
  const p = players.find((x) => x.id === playerId);
  return (
    p?.character?.name?.trim() ||
    p?.displayName?.trim() ||
    `Seat ${(p?.seatIndex ?? 0) + 1}`
  );
}

function shortVpLabel(players: GamePlayerView[], playerId: string): string {
  const full = labelForPlayer(players, playerId);
  const words = full.trim().split(/\s+/);
  if (words[0] && words[0].length <= 12) return words[0]!;
  return full.slice(0, 10) + (full.length > 10 ? "…" : "");
}

export function PartyPlayPanel({
  sessionId,
  currentPlayerId,
  party,
  players,
  sceneNarrativeForDedupe = null,
}: Props) {
  const { toast } = useToast();
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgeryGuessSent, setForgeryGuessSent] = useState(false);
  const [partyMe, setPartyMe] = useState<PartyMeView | null>(null);
  const [tableSheetOpen, setTableSheetOpen] = useState(false);
  const prevMyVpRef = useRef<number | null>(null);

  const myVp =
    currentPlayerId != null
      ? (party.vpTotals?.[currentPlayerId] ?? 0)
      : undefined;

  useEffect(() => {
    if (currentPlayerId == null || myVp === undefined) {
      prevMyVpRef.current = null;
      return;
    }
    const ph = party.partyPhase;
    if (ph === "lobby" || ph === "ended") {
      prevMyVpRef.current = myVp;
      return;
    }
    const prev = prevMyVpRef.current;
    prevMyVpRef.current = myVp;
    if (prev === null) return;
    if (myVp > prev) {
      toast(
        myVp === 1
          ? "The crowd picked your line — +1 VP"
          : `The crowd picked your line — ${myVp} VP total`,
        "success",
      );
    }
  }, [currentPlayerId, myVp, party.partyPhase, toast]);

  useEffect(() => {
    if (party.partyPhase !== "forgery_guess") {
      setForgeryGuessSent(false);
    }
  }, [party.partyPhase]);

  useEffect(() => {
    const ph = party.partyPhase;
    if (!sessionId || ph === "lobby" || ph === "ended") {
      setPartyMe(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/party/me`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { me: PartyMeView };
        if (!cancelled) setPartyMe(data.me);
      } catch {
        if (!cancelled) setPartyMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, party.partyPhase, party.roundIndex, party.tiebreakContenderIds]);

  useEffect(() => {
    const phase = party.partyPhase;
    if (
      (phase !== "submit" &&
        phase !== "vote" &&
        phase !== "forgery_guess" &&
        phase !== "reveal" &&
        phase !== "tiebreak_submit" &&
        phase !== "tiebreak_vote" &&
        phase !== "finale_tie_vote") ||
      !party.phaseDeadlineIso
    ) {
      return;
    }
    const id = window.setInterval(() => {
      void fetch(`/api/sessions/${sessionId}/party/phase-tick`, {
        method: "POST",
      });
    }, 10_000);
    return () => window.clearInterval(id);
  }, [sessionId, party.partyPhase, party.phaseDeadlineIso]);

  const phase = party.partyPhase;
  const mySubmission = currentPlayerId
    ? party.submissions?.[currentPlayerId]
    : undefined;
  const myVote = currentPlayerId
    ? party.votesThisRound?.[currentPlayerId]
    : undefined;

  const isFinaleContender =
    phase === "finale_tie_vote" &&
    Boolean(
      currentPlayerId &&
        party.finaleTieContenderIds?.includes(currentPlayerId),
    );

  const voteTargets = useMemo(() => {
    if (phase !== "vote" || !party.submissions) return [];
    return Object.entries(party.submissions)
      .filter(([pid, s]) => pid !== currentPlayerId && s.text?.trim())
      .map(([pid, s]) => ({ playerId: pid, text: s.text, label: labelForPlayer(players, pid) }));
  }, [phase, party.submissions, currentPlayerId, players]);

  const votableAnonymousSlots = useMemo(() => {
    if (
      (phase !== "vote" &&
        phase !== "tiebreak_vote" &&
        phase !== "finale_tie_vote") ||
      !party.submissionSlots?.length
    ) {
      return [];
    }
    const mine = partyMe?.myCrowdVoteSlotId ?? null;
    const allowed = party.crowdVoteSlotIds;
    const base =
      allowed && allowed.length > 0
        ? party.submissionSlots.filter((s) => allowed.includes(s.slotId))
        : party.submissionSlots;
    return base.filter((s) => s.slotId !== mine);
  }, [
    phase,
    party.submissionSlots,
    party.crowdVoteSlotIds,
    partyMe?.myCrowdVoteSlotId,
  ]);

  const useAnonymousVoteCards =
    (phase === "vote" ||
      phase === "tiebreak_vote" ||
      phase === "finale_tie_vote") &&
    Boolean(party.crowdVoteSlotIds?.length) &&
    votableAnonymousSlots.length > 0;

  const crowdScoreRows = useMemo(() => {
    const vp = party.vpTotals ?? {};
    const fp = party.fpTotals ?? {};
    return players
      .filter((p) => !p.isDm)
      .map((p) => ({
        id: p.id,
        n: vp[p.id] ?? 0,
        fp: fp[p.id] ?? 0,
        label: labelForPlayer(players, p.id),
      }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [players, party.vpTotals, party.fpTotals]);

  const vpRows = useMemo(() => {
    const t = party.vpTotals ?? {};
    return Object.entries(t)
      .map(([id, n]) => ({ id, n, label: labelForPlayer(players, id) }))
      .sort((a, b) => b.n - a.n);
  }, [party.vpTotals, players]);

  const fpRows = useMemo(() => {
    const t = party.fpTotals ?? {};
    return Object.entries(t)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n, label: labelForPlayer(players, id) }))
      .sort((a, b) => b.n - a.n);
  }, [party.fpTotals, players]);

  const spRows = useMemo(() => {
    const t = party.secretBpTotals ?? {};
    return Object.entries(t)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ id, n, label: labelForPlayer(players, id) }))
      .sort((a, b) => b.n - a.n);
  }, [party.secretBpTotals, players]);

  const showSecretBriefing =
    partyMe &&
    (Boolean(partyMe.secretRole) || (partyMe.bonusObjectives?.length ?? 0) > 0);

  const refetchPartyMe = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/party/me`);
      if (!res.ok) return;
      const data = (await res.json()) as { me: PartyMeView };
      setPartyMe(data.me);
    } catch {
      /* ignore */
    }
  }, [sessionId]);

  const submitLine = useCallback(async () => {
    if (!currentPlayerId || !line.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/party/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId, text: line.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Submit failed");
        return;
      }
      setLine("");
      void refetchPartyMe();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }, [sessionId, currentPlayerId, line, refetchPartyMe]);

  const castForgeryGuess = useCallback(
    async (slotId: string) => {
      if (!currentPlayerId) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/party/forgery-guess`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: currentPlayerId,
            slotId,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "Guess failed");
          return;
        }
        setForgeryGuessSent(true);
      } catch {
        setError("Network error");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, currentPlayerId],
  );

  const castVote = useCallback(
    async (targetPlayerId: string) => {
      if (!currentPlayerId) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/party/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: currentPlayerId,
            targetPlayerId,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "Vote failed");
        }
      } catch {
        setError("Network error");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, currentPlayerId],
  );

  const castVoteBySlot = useCallback(
    async (targetSlotId: string) => {
      if (!currentPlayerId) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/party/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: currentPlayerId,
            targetSlotId,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(body.error ?? "Vote failed");
        }
      } catch {
        setError("Network error");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, currentPlayerId],
  );

  const canTiebreakSubmit =
    phase === "tiebreak_submit" &&
    Boolean(
      currentPlayerId &&
        party.tiebreakContenderIds?.includes(currentPlayerId),
    );

  if (phase === "ended") {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <h2 className="text-lg font-semibold text-[var(--color-silver)]">
          Party game over
        </h2>
        {party.partyChampionPlayerId ? (
          <p className="text-sm text-[var(--color-silver-muted)]">
            Table champion:{" "}
            <span className="font-medium text-[var(--color-gold)]">
              {labelForPlayer(players, party.partyChampionPlayerId)}
            </span>
          </p>
        ) : null}
        <p className="text-sm text-[var(--color-silver-muted)]">
          Crowd favorite scores (votes won per round):
        </p>
        <ul className="space-y-2">
          {vpRows.length === 0 ? (
            <li className="text-sm text-[var(--color-silver-dim)]">No votes recorded.</li>
          ) : (
            vpRows.map((row) => (
              <li
                key={row.id}
                className="flex justify-between rounded-[var(--radius-chip)] border border-white/10 bg-[var(--glass-bg)]/30 px-3 py-2 text-sm text-[var(--color-silver-muted)]"
              >
                <span>{row.label}</span>
                <span className="text-[var(--color-gold)]">{row.n}</span>
              </li>
            ))
          )}
        </ul>
        {fpRows.length > 0 ? (
          <>
            <p className="mt-4 text-sm text-[var(--color-silver-muted)]">
              Instigator calls (correctly spotted the fake line):
            </p>
            <ul className="space-y-2">
              {fpRows.map((row) => (
                <li
                  key={row.id}
                  className="flex justify-between rounded-[var(--radius-chip)] border border-white/10 bg-[var(--glass-bg)]/30 px-3 py-2 text-sm text-[var(--color-silver-muted)]"
                >
                  <span>{row.label}</span>
                  <span className="text-[var(--color-gold)]">{row.n}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {spRows.length > 0 ? (
          <>
            <p className="mt-4 text-sm text-[var(--color-silver-muted)]">
              Secret objectives (keyword hits in your lines):
            </p>
            <ul className="space-y-2">
              {spRows.map((row) => (
                <li
                  key={row.id}
                  className="flex justify-between rounded-[var(--radius-chip)] border border-white/10 bg-[var(--glass-bg)]/30 px-3 py-2 text-sm text-[var(--color-silver-muted)]"
                >
                  <span>{row.label}</span>
                  <span className="text-[var(--color-gold)]">{row.n}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <Link
          href="/"
          className="mt-2 flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius-button)] bg-gradient-to-b from-[var(--color-gold-rare)] to-[var(--color-gold-support)] px-8 py-4 text-base font-bold uppercase tracking-[0.15em] text-[var(--color-obsidian)] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_12px_rgba(242,202,80,0.3)] transition-all [transition-timing-function:var(--ease-out-soft)] duration-[var(--duration-med)] hover:brightness-110 active:scale-[0.97] active:shadow-none"
        >
          Start a full campaign
        </Link>
        <p className="text-center text-[10px] text-[var(--color-outline)]">
          Opens home to create a standard RPG session with quests and turns.
        </p>
      </div>
    );
  }

  const scene = sceneNarrativeForDedupe;
  const showCarryForward =
    party.carryForward?.trim() &&
    !isPartyBlockShownInScene(scene, party.carryForward);
  const showMergedInPanel =
    party.mergedBeat?.trim() &&
    !isPartyBlockShownInScene(scene, party.mergedBeat);
  const revealMergedDuplicated =
    phase === "reveal" &&
    Boolean(party.mergedBeat?.trim()) &&
    isPartyBlockShownInScene(scene, party.mergedBeat);

  const showPhaseDeadline =
    phase === "submit" ||
    phase === "vote" ||
    phase === "forgery_guess" ||
    phase === "reveal" ||
    phase === "tiebreak_submit" ||
    phase === "tiebreak_vote" ||
    phase === "finale_tie_vote";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-1 pt-0">
      {party.sharedRoleLabel?.trim() ? (
        <PartySessionCard title="Shared lens" variant="muted">
          <p className="text-[10px] leading-relaxed text-[var(--color-silver-muted)]">
            <span className="font-semibold text-[var(--color-gold-rare)]">
              Everyone steers:{" "}
            </span>
            {party.sharedRoleLabel}
          </p>
        </PartySessionCard>
      ) : null}

      {showCarryForward ? (
        <PartySessionCard title="Where we left off" variant="muted">
          <p className="whitespace-pre-wrap text-xs text-[var(--color-silver-muted)]">
            {party.carryForward}
          </p>
        </PartySessionCard>
      ) : null}

      {showSecretBriefing && partyMe ? (
        <PartySessionCard title="Your secret briefing">
          {partyMe.secretRole ? (
            <p className="text-sm font-medium text-[var(--color-silver)]">
              {partyMe.secretRole}
            </p>
          ) : null}
          {partyMe.bonusObjectives.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--color-silver-muted)]">
              {partyMe.bonusObjectives.map((o) => (
                <li
                  key={o.id}
                  className={o.completed ? "text-[var(--color-gold)] line-through opacity-80" : ""}
                >
                  {o.text}
                </li>
              ))}
            </ul>
          ) : null}
          {partyMe.secretBonusPoints > 0 ? (
            <p className="mt-2 text-[10px] text-[var(--color-outline)]">
              Secret bonus points: {partyMe.secretBonusPoints}
            </p>
          ) : null}
        </PartySessionCard>
      ) : null}

      {(phase === "vote" ||
        phase === "forgery_guess" ||
        phase === "tiebreak_vote" ||
        phase === "finale_tie_vote") &&
      showMergedInPanel ? (
        <PartySessionCard title="Merged beat">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-silver-muted)]">
            {party.mergedBeat}
          </p>
        </PartySessionCard>
      ) : null}

      {phase === "reveal" && party.mergedBeat?.trim() ? (
        <PartySessionCard
          title={revealMergedDuplicated ? "Who wrote what" : "Round recap"}
        >
          {!revealMergedDuplicated ? (
            <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-silver-muted)]">
              {party.mergedBeat}
            </p>
          ) : (
            <p className="mb-3 text-[10px] text-[var(--color-outline)]">
              Story is above in Scene — here’s how lines map to players.
            </p>
          )}
          {party.slotAttribution && party.submissionSlots?.length ? (
            <ul className="space-y-2">
              {party.submissionSlots.map((s) => {
                const kind = party.slotAttribution?.[s.slotId];
                return (
                  <li
                    key={s.slotId}
                    className="flex flex-col gap-1 rounded-[var(--radius-chip)] border border-white/12 bg-black/30 px-3 py-2.5 text-left"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gold-rare)]/90">
                      {kind === "forgery" ? "Instigator (fake)" : "Player line"}
                    </span>
                    <span className="text-sm text-[var(--color-silver-muted)]">
                      {s.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </PartySessionCard>
      ) : null}

      {phase === "tiebreak_submit" && !canTiebreakSubmit ? (
        <p className="text-sm text-[var(--color-silver-muted)]">
          The crowd tied — only the tied players submit a fresh line for a quick
          revote.
        </p>
      ) : null}

      {(phase === "merge_pending" || phase === "narrate") && (
        <p className="text-sm text-[var(--color-silver-muted)]">
          Resolving round…
        </p>
      )}

      {phase === "reveal" && !party.mergedBeat?.trim() ? (
        <p className="text-sm text-[var(--color-silver-muted)]">Round results…</p>
      ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-white/10 bg-[var(--color-obsidian)]/96 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[10px] font-semibold tabular-nums text-[var(--color-silver-dim)]">
              R{party.roundIndex}/{party.totalRounds}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--outline)]">
              {phase}
            </span>
            {showPhaseDeadline && party.phaseDeadlineIso ? (
              <PartyPhaseDeadline iso={party.phaseDeadlineIso} />
            ) : null}
            {party.instigatorEnabled ? (
              <span className="rounded border border-white/12 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-outline)]">
                Instigator
              </span>
            ) : null}
            {phase !== "lobby" && crowdScoreRows.length > 0 ? (
              <span
                className="min-w-0 max-w-[min(100%,14rem)] truncate text-[10px] text-[var(--color-gold)]/95"
                title={crowdScoreRows
                  .map((r) => `${labelForPlayer(players, r.id)} ${r.n} VP`)
                  .join(" · ")}
              >
                {crowdScoreRows
                  .map((r) => `${shortVpLabel(players, r.id)} ${r.n}`)
                  .join(" · ")}
              </span>
            ) : null}
            <GhostButton
              type="button"
              className="ml-auto !min-h-[32px] shrink-0 !px-2.5 !py-1 !text-[10px]"
              onClick={() => setTableSheetOpen(true)}
            >
              Table & scores
            </GhostButton>
          </div>

          {phase === "forgery_guess" && party.submissionSlots?.length ? (
            <PartySessionCard title="Spot the fake" contentClassName="flex flex-col gap-2">
              <p className="text-xs text-[var(--color-silver-dim)]">
                Which line was the instigator (the fake)?
              </p>
              {forgeryGuessSent ? (
                <p className="text-sm text-[var(--color-silver-muted)]">
                  Guess locked. Waiting for others…
                </p>
              ) : (
                <ul className="flex max-h-[min(40vh,320px)] flex-col gap-2 overflow-y-auto">
                  {party.submissionSlots.map((s) => (
                    <li key={s.slotId}>
                      <GhostButton
                        type="button"
                        disabled={busy || !currentPlayerId}
                        className="h-auto w-full flex-col items-stretch gap-1 py-2.5 text-left"
                        onClick={() => void castForgeryGuess(s.slotId)}
                      >
                        <span className="text-sm text-[var(--color-silver-muted)]">
                          {s.text}
                        </span>
                      </GhostButton>
                    </li>
                  ))}
                </ul>
              )}
            </PartySessionCard>
          ) : null}

          {phase === "submit" || canTiebreakSubmit ? (
            <PartySessionCard
              title={canTiebreakSubmit ? "Tiebreak line" : "Your line"}
              contentClassName="flex flex-col gap-2"
            >
              <p className="text-[10px] leading-relaxed text-[var(--color-outline)]">
                {canTiebreakSubmit
                  ? "Votes tied — pitch a sharper take. Everyone else will vote anonymously again."
                  : "Same scene as everyone else — pitch how it should go next. Keep it short; the table votes on which direction sticks."}
              </p>
              <textarea
                value={line}
                onChange={(e) => setLine(e.target.value)}
                disabled={
                  busy ||
                  Boolean(
                    phase === "submit"
                      ? mySubmission
                      : partyMe?.mySubmittedTiebreak,
                  )
                }
                maxLength={2000}
                rows={3}
                className="min-h-[72px] w-full resize-y rounded-[var(--radius-chip)] border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--color-silver)] placeholder:text-[var(--color-silver-dim)] disabled:opacity-50 sm:min-h-[100px]"
                placeholder="One punchy line for this shared beat…"
              />
              {phase === "submit" && mySubmission ? (
                <p className="text-xs text-[var(--color-silver-dim)]">
                  You submitted. Waiting for others…
                </p>
              ) : canTiebreakSubmit && partyMe?.mySubmittedTiebreak ? (
                <p className="text-xs text-[var(--color-silver-dim)]">
                  Tiebreak line sent. Waiting for other tied players…
                </p>
              ) : (
                <GoldButton
                  type="button"
                  disabled={busy || !line.trim() || !currentPlayerId}
                  onClick={() => void submitLine()}
                >
                  {busy ? "Sending…" : canTiebreakSubmit ? "Submit tiebreak" : "Submit line"}
                </GoldButton>
              )}
            </PartySessionCard>
          ) : null}

          {phase === "vote" || phase === "tiebreak_vote" || phase === "finale_tie_vote" ? (
            <PartySessionCard title="Vote" contentClassName="flex flex-col gap-3">
              {isFinaleContender ? (
                <p className="text-sm text-[var(--color-silver-muted)]">
                  You&apos;re tied for the crown — the rest of the table is picking
                  among the finalists.
                </p>
              ) : null}
              {!isFinaleContender ? (
                <>
                  <p className="text-xs text-[var(--color-silver-dim)]">
                    {phase === "finale_tie_vote"
                      ? "Pick which tied leader should take the table — anonymous cards."
                      : useAnonymousVoteCards
                        ? "Pick the line that should steer the story — cards are anonymous (not your own)."
                        : "Vote for your favorite line (not yourself)."}
                  </p>
                  {myVote ? (
                    <p className="text-sm text-[var(--color-silver-muted)]">
                      Vote locked. Waiting for others…
                    </p>
                  ) : useAnonymousVoteCards ? (
                    partyMe === null && currentPlayerId ? (
                      <p className="text-sm text-[var(--color-silver-dim)]">
                        Loading ballot…
                      </p>
                    ) : votableAnonymousSlots.length === 0 ? (
                      <p className="text-sm text-[var(--color-silver-dim)]">
                        No other lines to vote on this round.
                      </p>
                    ) : (
                      <ul className="grid max-h-[min(42vh,360px)] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 sm:gap-3">
                        {votableAnonymousSlots.map((s) => (
                          <li key={s.slotId}>
                            <button
                              type="button"
                              disabled={busy || !currentPlayerId}
                              onClick={() => void castVoteBySlot(s.slotId)}
                              className="flex min-h-[88px] w-full flex-col items-stretch justify-between rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.28)] bg-[var(--surface-container)]/45 px-3 py-2.5 text-left transition-colors hover:border-[var(--color-gold-rare)]/35 hover:bg-[var(--surface-container)]/65 disabled:opacity-50 sm:min-h-[120px] sm:px-4 sm:py-3"
                            >
                              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--outline)]">
                                Card
                              </span>
                              <span className="mt-1.5 text-sm leading-snug text-[var(--color-silver-muted)]">
                                {s.text}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : voteTargets.length === 0 ? (
                    <p className="text-sm text-[var(--color-silver-dim)]">
                      Need at least one other player with a line to vote on.
                    </p>
                  ) : (
                    <ul className="flex max-h-[min(40vh,320px)] flex-col gap-2 overflow-y-auto">
                      {voteTargets.map((t) => (
                        <li key={t.playerId}>
                          <GhostButton
                            type="button"
                            disabled={busy || !currentPlayerId}
                            className="h-auto w-full flex-col items-stretch gap-1 py-2.5 text-left"
                            onClick={() => void castVote(t.playerId)}
                          >
                            <span className="text-xs text-[var(--color-gold)]">
                              {t.label}
                            </span>
                            <span className="text-sm text-[var(--color-silver-muted)]">
                              {t.text}
                            </span>
                          </GhostButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </PartySessionCard>
          ) : null}

          {error ? (
            <p className="text-sm text-red-300/90" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <BottomSheet
        isOpen={tableSheetOpen}
        onClose={() => setTableSheetOpen(false)}
        title="Table & scores"
      >
        <div className="flex flex-col gap-3 px-1 pb-6">
          <PartySessionCard title="Table" variant="muted" className="!py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--color-silver-dim)]">
                Round {party.roundIndex} / {party.totalRounds}
              </p>
              <span className="text-[10px] uppercase tracking-wide text-[var(--outline)]">
                {phase}
              </span>
            </div>
            {showPhaseDeadline && (
              <div className="mt-2">
                <PartyPhaseDeadline iso={party.phaseDeadlineIso} />
              </div>
            )}
          </PartySessionCard>

          {phase !== "lobby" ? (
            <PartySessionCard title="Crowd score" variant="muted" contentClassName="space-y-2">
              <p className="text-[10px] leading-relaxed text-[var(--color-outline)]">
                Winning the crowd vote each round earns{" "}
                <span className="text-[var(--color-silver-dim)]">+1 VP</span>
                {party.instigatorEnabled
                  ? ". Spotting the fake line adds instigator points."
                  : "."}
              </p>
              {crowdScoreRows.length === 0 ? (
                <p className="text-xs text-[var(--color-silver-dim)]">No players yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {crowdScoreRows.map((row) => (
                    <li
                      key={row.id}
                      className={`flex items-center justify-between gap-2 rounded-[var(--radius-chip)] border px-2.5 py-2 text-xs ${
                        row.id === currentPlayerId
                          ? "border-[var(--color-gold-rare)]/45 bg-[var(--color-gold-rare)]/10"
                          : "border-white/10 bg-black/25"
                      }`}
                    >
                      <span className="min-w-0 truncate font-medium text-[var(--color-silver-muted)]">
                        {row.label}
                        {row.id === currentPlayerId ? (
                          <span className="ml-1 text-[10px] font-normal text-[var(--color-outline)]">
                            (you)
                          </span>
                        ) : null}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        {party.instigatorEnabled && row.fp > 0 ? (
                          <span
                            className="text-[10px] tabular-nums text-[var(--color-outline)]"
                            title="Instigator — spotted the fake"
                          >
                            🎯 {row.fp}
                          </span>
                        ) : null}
                        <span className="tabular-nums font-semibold text-[var(--color-gold)]">
                          {row.n} VP
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </PartySessionCard>
          ) : null}

          {party.instigatorEnabled ? (
            <PartySessionCard title="Mode" variant="muted" className="!py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-[var(--color-outline)]">
                Instigator on — one anonymous line is fake; guess it before the crowd vote.
              </p>
            </PartySessionCard>
          ) : null}
        </div>
      </BottomSheet>
    </>
  );
}
