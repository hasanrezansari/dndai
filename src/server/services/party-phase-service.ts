import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { players, sessions } from "@/lib/db/schema";
import { broadcastPartyStateRefresh } from "@/lib/party/party-socket";
import { pickAutoForgeryGuessSlot } from "@/lib/party/party-slot-utils";
import {
  buildNextPartyConfigAfterVote,
  fillPartyAutoVotes,
  listParticipantsWhoMustVote,
} from "@/lib/party/party-vote-resolution";
import {
  DEFAULT_PARTY_TOTAL_ROUNDS,
  getDefaultPartyTemplateKeyForBrand,
  PARTY_FORGERY_GUESS_DEADLINE_SEC,
  PARTY_SUBMIT_DEADLINE_SEC,
  PARTY_VOTE_DEADLINE_SEC,
} from "@/lib/party/party-templates";
import {
  PartyConfigV1Schema,
  createInitialPartyConfig,
  type PartyConfigV1,
} from "@/lib/schemas/party";

import { dealPartySecretsIfNeeded } from "@/server/services/party-secret-service";
import { SessionNotFoundError } from "@/server/services/session-service";

function isoDeadlineFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isDeadlinePassed(iso: string | null | undefined): boolean {
  if (!iso?.trim()) return false;
  return new Date(iso).getTime() <= Date.now();
}

/** Players who submit/vote in party mode (excludes human DM seat). */
export async function listPartyParticipantPlayerIds(
  sessionId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: players.id, is_dm: players.is_dm })
    .from(players)
    .where(eq(players.session_id, sessionId))
    .orderBy(asc(players.seat_index));
  const nonDm = rows.filter((r) => !r.is_dm).map((r) => r.id);
  return nonDm.length > 0 ? nonDm : rows.map((r) => r.id);
}

/**
 * After lobby start: move party from `lobby` → `submit` for round 1.
 * Does not run campaign seeder or create RPG turns.
 */
export async function activatePartySessionFromLobby(
  sessionId: string,
): Promise<PartyConfigV1> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) {
    throw new SessionNotFoundError();
  }
  if (row.game_kind !== "party") {
    throw new Error("activatePartySessionFromLobby called on non-party session");
  }

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  const base: PartyConfigV1 = parsed.success
    ? parsed.data
    : createInitialPartyConfig(
        getDefaultPartyTemplateKeyForBrand(),
        DEFAULT_PARTY_TOTAL_ROUNDS,
      );

  const next: PartyConfigV1 = {
    ...base,
    party_phase: "submit",
    round_index: 1,
    submissions: {},
    votes_this_round: {},
    fp_totals: base.fp_totals ?? {},
    merged_beat: null,
    scene_image_url: null,
    phase_deadline_iso: isoDeadlineFromNow(PARTY_SUBMIT_DEADLINE_SEC),
  };

  const [updated] = await db
    .update(sessions)
    .set({
      party_config: next,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, sessionId))
    .returning({ state_version: sessions.state_version });

  if (!updated) {
    throw new Error("Failed to update party session");
  }

  await dealPartySecretsIfNeeded(sessionId);

  return next;
}

function allParticipantsSubmitted(
  participantIds: string[],
  cfg: PartyConfigV1,
): boolean {
  if (participantIds.length === 0) return false;
  const subs = cfg.submissions ?? {};
  return participantIds.every((id) => Boolean(subs[id]?.text?.trim()));
}

function submissionCount(
  participantIds: string[],
  cfg: PartyConfigV1,
): number {
  const subs = cfg.submissions ?? {};
  return participantIds.filter((id) => subs[id]?.text?.trim()).length;
}

async function extendPartySubmitDeadlineIfStale(
  sessionId: string,
  row: typeof sessions.$inferSelect,
  cfg: PartyConfigV1,
): Promise<void> {
  const next: PartyConfigV1 = {
    ...cfg,
    phase_deadline_iso: isoDeadlineFromNow(PARTY_SUBMIT_DEADLINE_SEC),
  };
  const [updated] = await db
    .update(sessions)
    .set({
      party_config: next,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (!updated) return;

  await broadcastPartyStateRefresh(sessionId, updated.state_version);
}

async function extendPartyVoteDeadline(
  sessionId: string,
  row: typeof sessions.$inferSelect,
  cfg: PartyConfigV1,
): Promise<void> {
  const next: PartyConfigV1 = {
    ...cfg,
    phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
  };
  const [updated] = await db
    .update(sessions)
    .set({
      party_config: next,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (!updated) return;

  await broadcastPartyStateRefresh(sessionId, updated.state_version);
}

async function persistPartyConfigOptimistic(
  sessionId: string,
  row: typeof sessions.$inferSelect,
  nextConfig: PartyConfigV1,
): Promise<number | null> {
  const [updated] = await db
    .update(sessions)
    .set({
      party_config: nextConfig,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (!updated) return null;

  await broadcastPartyStateRefresh(sessionId, updated.state_version);
  return updated.state_version;
}

/**
 * When every participant has submitted, or the submit timer expired with at least
 * one line: run AI merge → `vote` (or straight to next round if only one line exists).
 * If the timer expired with zero lines, extends the submit deadline.
 */
export async function tryPartyMergeWhenReady(sessionId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.game_kind, "party")),
    )
    .limit(1);
  if (!row || row.status !== "active") return;

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success || parsed.data.party_phase !== "submit") return;

  const cfg = parsed.data;
  const participantIds = await listPartyParticipantPlayerIds(sessionId);
  const allSubs = allParticipantsSubmitted(participantIds, cfg);
  const nSub = submissionCount(participantIds, cfg);
  const deadlinePassed = isDeadlinePassed(cfg.phase_deadline_iso);

  if (!allSubs) {
    if (deadlinePassed && nSub === 0) {
      await extendPartySubmitDeadlineIfStale(sessionId, row, cfg);
    }
    if (!(deadlinePassed && nSub > 0)) return;
  }

  const submissionIds = participantIds.filter(
    (id) => (cfg.submissions ?? {})[id]?.text?.trim(),
  );

  const { runPartyMergeForConfig } = await import(
    "@/lib/orchestrator/party-merge-runner"
  );
  let mergedBeat: string;
  let roundSlots: Awaited<
    ReturnType<typeof runPartyMergeForConfig>
  >["roundSlots"] = null;
  try {
    const mergeResult = await runPartyMergeForConfig({
      sessionId,
      sessionRow: row,
      cfg,
    });
    mergedBeat = mergeResult.mergedBeat;
    roundSlots = mergeResult.roundSlots;
  } catch (e) {
    console.error("[party] merge failed", sessionId, e);
    mergedBeat =
      "The moment refuses to settle — something loud and contradictory stitches itself together anyway, and the table laughs through the confusion.";
    roundSlots = null;
  }

  if (submissionIds.length === 1) {
    const only = submissionIds[0]!;
    const cfgWithMerged: PartyConfigV1 = {
      ...cfg,
      merged_beat: mergedBeat,
      party_phase: "vote",
      votes_this_round: {},
      scene_image_url: null,
      phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
    };
    const nextConfig = buildNextPartyConfigAfterVote({
      cfg: cfgWithMerged,
      votes: {},
      submissionPlayerIds: submissionIds,
      forcedWinner: only,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
    });

    const version = await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    if (version != null) {
      const { schedulePartyRoundSceneImage } = await import(
        "@/lib/orchestrator/party-image-schedule"
      );
      void schedulePartyRoundSceneImage({
        sessionId,
        mergedBeat,
        roundIndex: cfg.round_index,
      });
    }
    return;
  }

  const nextConfig: PartyConfigV1 = roundSlots
    ? {
        ...cfg,
        merged_beat: mergedBeat,
        submission_slots_public: roundSlots.submission_slots_public,
        slot_attribution: roundSlots.slot_attribution,
        instigator_slot_id: roundSlots.instigator_slot_id,
        party_phase: "forgery_guess",
        forgery_guesses: {},
        votes_this_round: {},
        scene_image_url: null,
        phase_deadline_iso: isoDeadlineFromNow(PARTY_FORGERY_GUESS_DEADLINE_SEC),
      }
    : {
        ...cfg,
        party_phase: "vote",
        merged_beat: mergedBeat,
        votes_this_round: {},
        scene_image_url: null,
        phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
      };

  const version = await persistPartyConfigOptimistic(sessionId, row, nextConfig);
  if (version == null) return;

  const { schedulePartyRoundSceneImage } = await import(
    "@/lib/orchestrator/party-image-schedule"
  );
  void schedulePartyRoundSceneImage({
    sessionId,
    mergedBeat,
    roundIndex: cfg.round_index,
  });
}

/**
 * When all players guessed the forgery slot, or the guess timer expired: → `vote`.
 */
export async function tryPartyForgeryGuessDeadlineAdvance(
  sessionId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.game_kind, "party")),
    )
    .limit(1);
  if (!row || row.status !== "active") return;

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success || parsed.data.party_phase !== "forgery_guess") return;

  const cfg = parsed.data;
  const participantIds = await listPartyParticipantPlayerIds(sessionId);
  const slotIds =
    cfg.submission_slots_public?.map((s) => s.slot_id) ?? [];
  if (slotIds.length === 0) return;

  const guesses = { ...(cfg.forgery_guesses ?? {}) };
  const mustGuess = participantIds;

  const allGuessed =
    mustGuess.length > 0 && mustGuess.every((id) => Boolean(guesses[id]));
  if (allGuessed) {
    const nextConfig: PartyConfigV1 = {
      ...cfg,
      forgery_guesses: guesses,
      party_phase: "vote",
      votes_this_round: {},
      phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
      merged_beat: cfg.merged_beat ?? null,
    };
    await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    return;
  }

  const deadlinePassed = isDeadlinePassed(cfg.phase_deadline_iso);
  if (!deadlinePassed) return;

  for (const pid of mustGuess) {
    if (!guesses[pid]) {
      const pick = pickAutoForgeryGuessSlot(slotIds);
      if (pick) guesses[pid] = pick;
    }
  }

  const nextConfig: PartyConfigV1 = {
    ...cfg,
    forgery_guesses: guesses,
    party_phase: "vote",
    votes_this_round: {},
    phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
    merged_beat: cfg.merged_beat ?? null,
  };
  await persistPartyConfigOptimistic(sessionId, row, nextConfig);
}

/**
 * After reveal timer: strip slot secrets and advance to next `submit`, or `ended`.
 */
export async function tryPartyRevealDeadlineAdvance(
  sessionId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.game_kind, "party")),
    )
    .limit(1);
  if (!row || row.status !== "active") return;

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success || parsed.data.party_phase !== "reveal") return;

  const cfg = parsed.data;
  if (!isDeadlinePassed(cfg.phase_deadline_iso)) return;

  const isLastRound = cfg.round_index >= cfg.total_rounds;

  const cleared: Partial<PartyConfigV1> = {
    submission_slots_public: undefined,
    slot_attribution: undefined,
    instigator_slot_id: null,
    forgery_guesses: undefined,
    merged_beat: null,
    scene_image_url: null,
    votes_this_round: {},
  };

  if (isLastRound) {
    const nextConfig: PartyConfigV1 = {
      ...cfg,
      ...cleared,
      party_phase: "ended",
      phase_deadline_iso: null,
    };
    await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    return;
  }

  const nextConfig: PartyConfigV1 = {
    ...cfg,
    ...cleared,
    party_phase: "submit",
    round_index: cfg.round_index + 1,
    submissions: {},
    phase_deadline_iso: isoDeadlineFromNow(PARTY_SUBMIT_DEADLINE_SEC),
  };
  await persistPartyConfigOptimistic(sessionId, row, nextConfig);
}

export async function applyPartyForgeryGuessAndMaybeAdvance(params: {
  sessionId: string;
  playerId: string;
  slotId: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!row) return { ok: false, error: "Not found", status: 404 };
  if (row.game_kind !== "party") {
    return { ok: false, error: "Not a party session", status: 409 };
  }
  if (row.status !== "active") {
    return { ok: false, error: "Session is not active", status: 409 };
  }

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success) {
    return { ok: false, error: "Invalid party state", status: 500 };
  }
  const cfg = parsed.data;
  if (cfg.party_phase !== "forgery_guess") {
    return { ok: false, error: "Not in forgery guess phase", status: 409 };
  }

  const participantIds = await listPartyParticipantPlayerIds(params.sessionId);
  if (!participantIds.includes(params.playerId)) {
    return { ok: false, error: "Not a party participant", status: 403 };
  }

  const slotIds = new Set(
    cfg.submission_slots_public?.map((s) => s.slot_id) ?? [],
  );
  if (!slotIds.has(params.slotId)) {
    return { ok: false, error: "Invalid slot", status: 400 };
  }

  const guesses = { ...(cfg.forgery_guesses ?? {}) };
  if (guesses[params.playerId]) {
    return { ok: false, error: "Already guessed this round", status: 409 };
  }
  guesses[params.playerId] = params.slotId;

  const mustGuess = participantIds;
  const allGuessed =
    mustGuess.length > 0 && mustGuess.every((id) => Boolean(guesses[id]));

  let nextConfig: PartyConfigV1;
  if (!allGuessed) {
    nextConfig = { ...cfg, forgery_guesses: guesses };
  } else {
    nextConfig = {
      ...cfg,
      forgery_guesses: guesses,
      party_phase: "vote",
      votes_this_round: {},
      phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
      merged_beat: cfg.merged_beat ?? null,
    };
  }

  const [updated] = await db
    .update(sessions)
    .set({
      party_config: nextConfig,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, params.sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (!updated) {
    return { ok: false, error: "Concurrent update — retry", status: 409 };
  }

  await broadcastPartyStateRefresh(params.sessionId, updated.state_version);

  return { ok: true };
}

/**
 * After vote deadline: assign deterministic votes for anyone missing, then tally.
 * Single-submitter rounds are resolved immediately in `tryPartyMergeWhenReady`.
 */
export async function tryPartyVoteDeadlineAdvance(
  sessionId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.id, sessionId), eq(sessions.game_kind, "party")),
    )
    .limit(1);
  if (!row || row.status !== "active") return;

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success || parsed.data.party_phase !== "vote") return;

  const cfg = parsed.data;
  const participantIds = await listPartyParticipantPlayerIds(sessionId);
  const subs = cfg.submissions ?? {};
  const submissionIds = participantIds.filter((id) => subs[id]?.text?.trim());
  if (submissionIds.length === 0) return;

  const mustVote = listParticipantsWhoMustVote(participantIds, submissionIds);
  let votes = { ...(cfg.votes_this_round ?? {}) };

  if (mustVote.length === 0) {
    const cfgVote: PartyConfigV1 = {
      ...cfg,
      party_phase: "vote",
      merged_beat: cfg.merged_beat ?? null,
    };
    const nextConfig = buildNextPartyConfigAfterVote({
      cfg: cfgVote,
      votes,
      submissionPlayerIds: submissionIds,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
    });
    await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    return;
  }

  const deadlinePassed = isDeadlinePassed(cfg.phase_deadline_iso);
  if (!deadlinePassed) return;

  votes = fillPartyAutoVotes({
    participantIds,
    submissionPlayerIds: submissionIds,
    votes,
  });

  if (!mustVote.every((id) => votes[id])) {
    await extendPartyVoteDeadline(sessionId, row, cfg);
    return;
  }

  const cfgVote: PartyConfigV1 = {
    ...cfg,
    party_phase: "vote",
    merged_beat: cfg.merged_beat ?? null,
  };
  const nextConfig = buildNextPartyConfigAfterVote({
    cfg: cfgVote,
    votes,
    submissionPlayerIds: submissionIds,
    isoDeadlineFromNow,
    submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
  });

  await persistPartyConfigOptimistic(sessionId, row, nextConfig);
}

/**
 * Record one vote; when all participants have voted, tally VP, set carry_forward, advance round or end.
 */
export async function applyPartyVoteAndMaybeAdvance(params: {
  sessionId: string;
  voterPlayerId: string;
  targetPlayerId: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!row) return { ok: false, error: "Not found", status: 404 };
  if (row.game_kind !== "party") {
    return { ok: false, error: "Not a party session", status: 409 };
  }
  if (row.status !== "active") {
    return { ok: false, error: "Session is not active", status: 409 };
  }

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success) {
    return { ok: false, error: "Invalid party state", status: 500 };
  }
  const cfg = parsed.data;
  if (cfg.party_phase !== "vote") {
    return { ok: false, error: "Not in voting phase", status: 409 };
  }

  const participantIds = await listPartyParticipantPlayerIds(params.sessionId);
  if (!participantIds.includes(params.voterPlayerId)) {
    return { ok: false, error: "Not a party participant", status: 403 };
  }
  if (params.voterPlayerId === params.targetPlayerId) {
    return { ok: false, error: "Cannot vote for yourself", status: 400 };
  }
  const subs = cfg.submissions ?? {};
  if (!subs[params.targetPlayerId]?.text?.trim()) {
    return { ok: false, error: "Invalid vote target", status: 400 };
  }

  const votes = { ...(cfg.votes_this_round ?? {}) };
  if (votes[params.voterPlayerId]) {
    return { ok: false, error: "Already voted this round", status: 409 };
  }
  votes[params.voterPlayerId] = params.targetPlayerId;

  const submissionIds = participantIds.filter((id) => subs[id]?.text?.trim());
  const mustVote = listParticipantsWhoMustVote(participantIds, submissionIds);
  if (mustVote.length === 0) {
    return { ok: false, error: "No eligible voters this round", status: 409 };
  }
  const allVoted = mustVote.every((id) => votes[id]);

  let nextConfig: PartyConfigV1;

  if (!allVoted) {
    nextConfig = { ...cfg, votes_this_round: votes };
  } else {
    const cfgVote: PartyConfigV1 = {
      ...cfg,
      party_phase: "vote",
      merged_beat: cfg.merged_beat ?? null,
    };
    nextConfig = buildNextPartyConfigAfterVote({
      cfg: cfgVote,
      votes,
      submissionPlayerIds: submissionIds,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
    });
  }

  const [updated] = await db
    .update(sessions)
    .set({
      party_config: nextConfig,
      state_version: row.state_version + 1,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(sessions.id, params.sessionId),
        eq(sessions.state_version, row.state_version),
      ),
    )
    .returning({ state_version: sessions.state_version });

  if (!updated) {
    return { ok: false, error: "Concurrent update — retry", status: 409 };
  }

  await broadcastPartyStateRefresh(params.sessionId, updated.state_version);

  return { ok: true };
}
