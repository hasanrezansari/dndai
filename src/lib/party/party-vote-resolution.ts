import { applyForgeryPointsFromGuesses } from "@/lib/party/party-slot-utils";
import { PARTY_REVEAL_DEADLINE_SEC } from "@/lib/party/party-templates";
import type { PartyConfigV1 } from "@/lib/schemas/party";

/** Instigator rounds with slot data need a reveal beat after the crowd vote. */
export function shouldPartyRevealAfterVote(cfg: PartyConfigV1): boolean {
  return Boolean(
    cfg.submission_slots_public?.length && cfg.instigator_slot_id?.trim(),
  );
}

export function pickVoteWinner(
  votes: Record<string, string>,
  submissionPlayerIds: string[],
): string | null {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const sorted = [...submissionPlayerIds].sort();
  let best: string | null = null;
  let bestCount = -1;
  for (const pid of sorted) {
    const c = counts.get(pid) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = pid;
    }
  }
  return bestCount > 0 ? best : null;
}

/** Deterministic auto-vote: smallest UUID among valid targets (not self, has submission). */
export function pickAutoVoteTarget(
  voterId: string,
  submissionPlayerIds: string[],
): string | null {
  const targets = submissionPlayerIds
    .filter((id) => id !== voterId)
    .sort((a, b) => a.localeCompare(b));
  return targets[0] ?? null;
}

/**
 * Fill missing votes for deadline resolution. Returns whether every participant has a vote entry.
 */
export function fillPartyAutoVotes(params: {
  participantIds: string[];
  submissionPlayerIds: string[];
  votes: Record<string, string>;
}): Record<string, string> {
  const out = { ...params.votes };
  for (const pid of params.participantIds) {
    if (out[pid]) continue;
    const t = pickAutoVoteTarget(pid, params.submissionPlayerIds);
    if (t) out[pid] = t;
  }
  return out;
}

export function allParticipantsHaveVote(
  participantIds: string[],
  votes: Record<string, string>,
): boolean {
  return participantIds.length > 0 && participantIds.every((id) => Boolean(votes[id]));
}

/** Players who have at least one valid vote target (not self, has a line). */
export function listParticipantsWhoMustVote(
  participantIds: string[],
  submissionPlayerIds: string[],
): string[] {
  return participantIds.filter(
    (id) => pickAutoVoteTarget(id, submissionPlayerIds) != null,
  );
}

export function allRequiredVotesCast(
  mustVote: string[],
  votes: Record<string, string>,
): boolean {
  if (mustVote.length === 0) return true;
  return mustVote.every((id) => Boolean(votes[id]));
}

export function buildNextPartyConfigAfterVote(params: {
  cfg: PartyConfigV1;
  votes: Record<string, string>;
  submissionPlayerIds: string[];
  /** When set (including `null`), skip tally and use this winner; `null` = no VP increment. */
  forcedWinner?: string | null;
  isoDeadlineFromNow: (seconds: number) => string;
  submitDeadlineSec: number;
}): PartyConfigV1 {
  const { cfg, votes, submissionPlayerIds, forcedWinner, isoDeadlineFromNow, submitDeadlineSec } =
    params;
  const subs = cfg.submissions ?? {};
  let winner: string | null;
  if (forcedWinner !== undefined) {
    winner = forcedWinner;
  } else {
    winner = pickVoteWinner(votes, submissionPlayerIds);
  }

  const vp = { ...(cfg.vp_totals ?? {}) };
  if (winner) {
    vp[winner] = (vp[winner] ?? 0) + 1;
  }
  const winnerText = winner ? (subs[winner]?.text ?? "").trim() : "";
  const carry =
    winnerText.length > 0
      ? winnerText.slice(0, 1200)
      : (cfg.carry_forward ?? null);

  const needReveal = shouldPartyRevealAfterVote(cfg);
  const isLastRound = cfg.round_index >= cfg.total_rounds;

  if (needReveal) {
    const fp = applyForgeryPointsFromGuesses({
      ...cfg,
      votes_this_round: votes,
    });
    return {
      ...cfg,
      votes_this_round: votes,
      vp_totals: vp,
      fp_totals: fp,
      carry_forward: carry,
      party_phase: "reveal",
      phase_deadline_iso: isoDeadlineFromNow(PARTY_REVEAL_DEADLINE_SEC),
      merged_beat: cfg.merged_beat ?? null,
    };
  }

  if (isLastRound) {
    return {
      ...cfg,
      votes_this_round: votes,
      vp_totals: vp,
      carry_forward: carry,
      party_phase: "ended",
      merged_beat: cfg.merged_beat ?? null,
      phase_deadline_iso: null,
    };
  }

  return {
    ...cfg,
    vp_totals: vp,
    carry_forward: carry,
    party_phase: "submit",
    round_index: cfg.round_index + 1,
    submissions: {},
    votes_this_round: {},
    merged_beat: null,
    scene_image_url: null,
    phase_deadline_iso: isoDeadlineFromNow(submitDeadlineSec),
  };
}
