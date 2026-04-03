"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { GhostButton } from "@/components/ui/ghost-button";
import { GoldButton } from "@/components/ui/gold-button";
import type { GamePlayerView } from "@/lib/state/game-store";
import type { PartyConfigClientView } from "@/lib/schemas/party";

type Props = {
  sessionId: string;
  currentPlayerId: string | null;
  party: PartyConfigClientView;
  players: GamePlayerView[];
};

type PartyMeView = {
  secretRole: string | null;
  roleKey: string | null;
  bonusObjectives: Array<{ id: string; text: string; completed: boolean }>;
  secretBonusPoints: number;
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

export function PartyPlayPanel({
  sessionId,
  currentPlayerId,
  party,
  players,
}: Props) {
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgeryGuessSent, setForgeryGuessSent] = useState(false);
  const [partyMe, setPartyMe] = useState<PartyMeView | null>(null);

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
  }, [sessionId, party.partyPhase, party.roundIndex]);

  useEffect(() => {
    const phase = party.partyPhase;
    if (
      (phase !== "submit" &&
        phase !== "vote" &&
        phase !== "forgery_guess" &&
        phase !== "reveal") ||
      !party.phaseDeadlineIso
    ) {
      return;
    }
    const id = window.setInterval(() => {
      void fetch(`/api/sessions/${sessionId}/party/phase-tick`, {
        method: "POST",
      });
    }, 20000);
    return () => window.clearInterval(id);
  }, [sessionId, party.partyPhase, party.phaseDeadlineIso]);

  const phase = party.partyPhase;
  const mySubmission = currentPlayerId
    ? party.submissions?.[currentPlayerId]
    : undefined;
  const myVote = currentPlayerId
    ? party.votesThisRound?.[currentPlayerId]
    : undefined;

  const voteTargets = useMemo(() => {
    if (phase !== "vote" || !party.submissions) return [];
    return Object.entries(party.submissions)
      .filter(([pid, s]) => pid !== currentPlayerId && s.text?.trim())
      .map(([pid, s]) => ({ playerId: pid, text: s.text, label: labelForPlayer(players, pid) }));
  }, [phase, party.submissions, currentPlayerId, players]);

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

  if (phase === "ended") {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <h2 className="text-lg font-semibold text-[var(--color-silver)]">
          Party game over
        </h2>
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

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-silver)]">
          Party mode
        </h2>
        <span className="text-xs uppercase tracking-wide text-[var(--color-silver-dim)]">
          Round {party.roundIndex} / {party.totalRounds} · {phase}
        </span>
      </div>

      {(phase === "submit" ||
        phase === "vote" ||
        phase === "forgery_guess" ||
        phase === "reveal") && (
        <PartyPhaseDeadline iso={party.phaseDeadlineIso} />
      )}

      {party.instigatorEnabled ? (
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-outline)]">
          Instigator on — one anonymous line is fake; guess it before the crowd vote.
        </p>
      ) : null}

      {party.carryForward?.trim() ? (
        <p className="rounded-[var(--radius-chip)] border border-white/10 bg-black/20 px-3 py-2 text-xs text-[var(--color-silver-muted)]">
          <span className="font-medium text-[var(--color-silver-dim)]">
            Carried forward:{" "}
          </span>
          {party.carryForward}
        </p>
      ) : null}

      {showSecretBriefing && partyMe ? (
        <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.35)] bg-[var(--surface-container)]/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-gold-rare)]">
            Your secret briefing
          </p>
          {partyMe.secretRole ? (
            <p className="mt-2 text-sm font-medium text-[var(--color-silver)]">
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
        </div>
      ) : null}

      {(phase === "vote" || phase === "forgery_guess") && party.mergedBeat?.trim() ? (
        <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-container)]/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-silver-dim)]">
            Merged beat
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-silver-muted)]">
            {party.mergedBeat}
          </p>
        </div>
      ) : null}

      {phase === "reveal" && party.mergedBeat?.trim() ? (
        <div className="rounded-[var(--radius-card)] border border-[rgba(77,70,53,0.2)] bg-[var(--surface-container)]/40 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-silver-dim)]">
            Round recap
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-silver-muted)]">
            {party.mergedBeat}
          </p>
          {party.slotAttribution && party.submissionSlots?.length ? (
            <ul className="mt-3 space-y-2 border-t border-white/10 pt-3">
              {party.submissionSlots.map((s) => {
                const kind = party.slotAttribution?.[s.slotId];
                return (
                  <li
                    key={s.slotId}
                    className="flex flex-col gap-1 rounded-[var(--radius-chip)] border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-[var(--color-silver-muted)]"
                  >
                    <span className="text-[10px] uppercase tracking-wide text-[var(--color-outline)]">
                      {kind === "forgery" ? "Instigator (fake)" : "Player line"}
                    </span>
                    <span>{s.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {phase === "forgery_guess" && party.submissionSlots?.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--color-silver-dim)]">
            Which line was the instigator (the fake)?
          </p>
          {forgeryGuessSent ? (
            <p className="text-sm text-[var(--color-silver-muted)]">
              Guess locked. Waiting for others…
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {party.submissionSlots.map((s) => (
                <li key={s.slotId}>
                  <GhostButton
                    type="button"
                    disabled={busy || !currentPlayerId}
                    className="h-auto w-full flex-col items-stretch gap-1 py-3 text-left"
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
        </div>
      ) : null}

      {phase === "submit" ? (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[var(--color-silver-dim)]">
            Your line this round
          </label>
          <textarea
            value={line}
            onChange={(e) => setLine(e.target.value)}
            disabled={busy || Boolean(mySubmission)}
            maxLength={2000}
            rows={4}
            className="min-h-[100px] w-full resize-y rounded-[var(--radius-chip)] border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--color-silver)] placeholder:text-[var(--color-silver-dim)] disabled:opacity-50"
            placeholder="Something funny, smart, or chaotic — keep it short."
          />
          {mySubmission ? (
            <p className="text-xs text-[var(--color-silver-dim)]">
              You submitted. Waiting for others…
            </p>
          ) : (
            <GoldButton
              type="button"
              disabled={busy || !line.trim() || !currentPlayerId}
              onClick={() => void submitLine()}
            >
              {busy ? "Sending…" : "Submit line"}
            </GoldButton>
          )}
        </div>
      ) : null}

      {phase === "vote" ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--color-silver-dim)]">
            Vote for your favorite line (not yourself).
          </p>
          {myVote ? (
            <p className="text-sm text-[var(--color-silver-muted)]">
              Vote locked. Waiting for others…
            </p>
          ) : voteTargets.length === 0 ? (
            <p className="text-sm text-[var(--color-silver-dim)]">
              Need at least one other player with a line to vote on.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {voteTargets.map((t) => (
                <li key={t.playerId}>
                  <GhostButton
                    type="button"
                    disabled={busy || !currentPlayerId}
                    className="h-auto w-full flex-col items-stretch gap-1 py-3 text-left"
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
        </div>
      ) : null}

      {(phase === "merge_pending" || phase === "narrate") && (
        <p className="text-sm text-[var(--color-silver-muted)]">
          Resolving round…
        </p>
      )}

      {phase === "reveal" && !party.mergedBeat?.trim() ? (
        <p className="text-sm text-[var(--color-silver-muted)]">Round results…</p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-300/90" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
