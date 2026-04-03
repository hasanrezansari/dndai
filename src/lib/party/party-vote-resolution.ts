import {
  applyForgeryPointsFromGuesses,
  buildFinaleAnonymousVoteSlots,
} from "@/lib/party/party-slot-utils";
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

/** All ids in `submissionPlayerIds` tied for the highest vote count (including 0). */
export function listTopVoteTargets(
  votes: Record<string, string>,
  submissionPlayerIds: string[],
): string[] {
  if (submissionPlayerIds.length === 0) return [];
  const counts = new Map<string, number>();
  for (const id of submissionPlayerIds) counts.set(id, 0);
  for (const target of Object.values(votes)) {
    if (counts.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  let max = -1;
  for (const id of submissionPlayerIds) {
    max = Math.max(max, counts.get(id) ?? 0);
  }
  return submissionPlayerIds
    .filter((id) => (counts.get(id) ?? 0) === max)
    .sort((a, b) => a.localeCompare(b));
}

export function listPlayersTiedForMaxVp(
  vp: Record<string, number>,
  participantIds: string[],
): string[] {
  if (participantIds.length === 0) return [];
  let max = -1;
  for (const id of participantIds) {
    max = Math.max(max, vp[id] ?? 0);
  }
  if (max < 0) return [];
  return participantIds
    .filter((id) => (vp[id] ?? 0) === max)
    .sort((a, b) => a.localeCompare(b));
}

export function soleVpLeaderOrNull(
  vp: Record<string, number>,
  participantIds: string[],
): string | null {
  const t = listPlayersTiedForMaxVp(vp, participantIds);
  return t.length === 1 ? t[0]! : null;
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

/** Finale: losers pick among VP-tied leaders only. */
export function pickAutoFinaleVoteTarget(
  voterId: string,
  contenderIds: string[],
): string | null {
  const targets = contenderIds
    .filter((id) => id !== voterId)
    .sort((a, b) => a.localeCompare(b));
  return targets[0] ?? null;
}

export function listFinaleVotersWhoMustVote(
  participantIds: string[],
  contenderIds: string[],
): string[] {
  const set = new Set(contenderIds);
  return participantIds.filter(
    (id) =>
      !set.has(id) && pickAutoFinaleVoteTarget(id, contenderIds) != null,
  );
}

export function fillPartyFinaleAutoVotes(params: {
  participantIds: string[];
  contenderIds: string[];
  votes: Record<string, string>;
}): Record<string, string> {
  const out = { ...params.votes };
  const losers = listFinaleVotersWhoMustVote(
    params.participantIds,
    params.contenderIds,
  );
  for (const pid of losers) {
    if (out[pid]) continue;
    const t = pickAutoFinaleVoteTarget(pid, params.contenderIds);
    if (t) out[pid] = t;
  }
  return out;
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

const clearTiebreakFields: Partial<PartyConfigV1> = {
  tiebreak_contender_ids: undefined,
  tiebreak_submissions: undefined,
};

export function enterPartyVoteTiebreak(params: {
  cfg: PartyConfigV1;
  tiedContenderIds: string[];
  isoDeadlineFromNow: (seconds: number) => string;
  submitDeadlineSec: number;
}): PartyConfigV1 {
  const ids = [...params.tiedContenderIds].sort((a, b) => a.localeCompare(b));
  return {
    ...params.cfg,
    ...clearTiebreakFields,
    party_phase: "tiebreak_submit",
    tiebreak_contender_ids: ids,
    tiebreak_submissions: {},
    votes_this_round: {},
    submission_slots_public: undefined,
    vote_slot_owner: undefined,
    phase_deadline_iso: params.isoDeadlineFromNow(params.submitDeadlineSec),
    merged_beat: params.cfg.merged_beat ?? null,
    round_scene_beat: null,
  };
}

export function buildPartyEndedAfterFinaleVote(params: {
  cfg: PartyConfigV1;
  votes: Record<string, string>;
  championPlayerId: string | null;
}): PartyConfigV1 {
  return {
    ...params.cfg,
    votes_this_round: params.votes,
    party_phase: "ended",
    merged_beat: params.cfg.merged_beat ?? null,
    round_scene_beat: null,
    phase_deadline_iso: null,
    submission_slots_public: undefined,
    vote_slot_owner: undefined,
    slot_attribution: undefined,
    instigator_slot_id: null,
    finale_tie_contender_ids: undefined,
    party_champion_player_id: params.championPlayerId,
    ...clearTiebreakFields,
  };
}

export function buildNextPartyConfigAfterVote(params: {
  cfg: PartyConfigV1;
  votes: Record<string, string>;
  submissionPlayerIds: string[];
  /** When set (including `null`), skip tally and use this winner; `null` = no VP increment. */
  forcedWinner?: string | null;
  /** Winner carry text source (defaults to cfg.submissions). Use cfg.tiebreak_submissions after tiebreak. */
  winnerLineSubmissions?: Record<
    string,
    { text: string; submitted_at: string }
  >;
  isoDeadlineFromNow: (seconds: number) => string;
  submitDeadlineSec: number;
  voteDeadlineSec: number;
  /** For end-of-game VP tie ballot. */
  participantIdsForVpTie?: string[];
  sessionId?: string;
}): PartyConfigV1 {
  const {
    cfg,
    votes,
    submissionPlayerIds,
    forcedWinner,
    winnerLineSubmissions,
    isoDeadlineFromNow,
    submitDeadlineSec,
    voteDeadlineSec,
    participantIdsForVpTie,
    sessionId,
  } = params;
  const subs = cfg.submissions ?? {};
  const textSrc = winnerLineSubmissions ?? subs;
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
  const winnerText = winner ? (textSrc[winner]?.text ?? "").trim() : "";
  /** Prefer merged AI beat so 2p auto-vote → next submit still shows the table story (not only the winning line). */
  const mergedTrim = cfg.merged_beat?.trim() ?? "";
  const carry =
    mergedTrim.length > 0
      ? mergedTrim.slice(0, 1200)
      : winnerText.length > 0
        ? winnerText.slice(0, 1200)
        : (cfg.carry_forward ?? null);

  const needReveal = shouldPartyRevealAfterVote(cfg);
  const isLastRound = cfg.round_index >= cfg.total_rounds;
  const vpTieIds =
    participantIdsForVpTie && participantIdsForVpTie.length > 0
      ? participantIdsForVpTie
      : submissionPlayerIds;

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
      round_scene_beat: null,
      ...clearTiebreakFields,
    };
  }

  if (isLastRound) {
    const tiedChamps = listPlayersTiedForMaxVp(vp, vpTieIds);
    if (tiedChamps.length > 1 && sessionId) {
      const finSlots = buildFinaleAnonymousVoteSlots({
        cfg,
        contenderIds: tiedChamps,
        sessionId,
      });
      if (finSlots) {
        return {
          ...cfg,
          votes_this_round: {},
          vp_totals: vp,
          carry_forward: carry,
          party_phase: "finale_tie_vote",
          finale_tie_contender_ids: tiedChamps,
          submission_slots_public: finSlots.submission_slots_public,
          vote_slot_owner: finSlots.vote_slot_owner,
          phase_deadline_iso: isoDeadlineFromNow(voteDeadlineSec),
          merged_beat: cfg.merged_beat ?? null,
          round_scene_beat: null,
          ...clearTiebreakFields,
        };
      }
    }
    const champion = soleVpLeaderOrNull(vp, vpTieIds) ?? tiedChamps[0] ?? null;
    return {
      ...cfg,
      votes_this_round: votes,
      vp_totals: vp,
      carry_forward: carry,
      party_phase: "ended",
      merged_beat: cfg.merged_beat ?? null,
      round_scene_beat: null,
      phase_deadline_iso: null,
      submission_slots_public: undefined,
      vote_slot_owner: undefined,
      slot_attribution: undefined,
      instigator_slot_id: null,
      finale_tie_contender_ids: undefined,
      party_champion_player_id: champion,
      ...clearTiebreakFields,
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
    round_scene_beat: null,
    scene_image_url: null,
    phase_deadline_iso: isoDeadlineFromNow(submitDeadlineSec),
    submission_slots_public: undefined,
    vote_slot_owner: undefined,
    slot_attribution: undefined,
    instigator_slot_id: null,
    ...clearTiebreakFields,
  };
}
