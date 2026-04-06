import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { players, sessions } from "@/lib/db/schema";
import { broadcastPartyStateRefresh } from "@/lib/party/party-socket";
import {
  buildAnonymousCrowdVoteSlots,
  buildFinaleAnonymousVoteSlots,
  pickAutoForgeryGuessSlot,
} from "@/lib/party/party-slot-utils";
import {
  buildNextPartyConfigAfterVote,
  buildPartyEndedAfterFinaleVote,
  enterPartyVoteTiebreak,
  fillPartyAutoVotes,
  fillPartyFinaleAutoVotes,
  listFinaleVotersWhoMustVote,
  listParticipantsWhoMustVote,
  listPlayersTiedForMaxVp,
  listTopVoteTargets,
  soleVpLeaderOrNull,
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
import {
  SPARK_COST_PARTY_JUDGE,
  SPARK_COST_PARTY_ROUND_OPENER,
} from "@/lib/spark-pricing";
import {
  InsufficientSparksError,
  isMonetizationSpendEnabled,
  tryCreditSparks,
  tryDebitSparks,
} from "@/server/services/spark-economy-service";

import { dealPartySecretsIfNeeded } from "@/server/services/party-secret-service";
import { SessionNotFoundError } from "@/server/services/session-service";

function isoDeadlineFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isDeadlinePassed(iso: string | null | undefined): boolean {
  if (!iso?.trim()) return false;
  return new Date(iso).getTime() <= Date.now();
}

async function runPartyJudgePickWinner(
  sessionId: string,
  sessionRow: typeof sessions.$inferSelect,
  cfg: PartyConfigV1,
  playerIds: string[],
  lineSource: "submissions" | "tiebreak",
): Promise<string | null> {
  const src =
    lineSource === "tiebreak"
      ? (cfg.tiebreak_submissions ?? {})
      : (cfg.submissions ?? {});
  const candidates = playerIds
    .map((id) => {
      const t = src[id]?.text?.trim();
      return t ? { player_id: id, text: t } : null;
    })
    .filter(Boolean) as Array<{ player_id: string; text: string }>;
  if (candidates.length === 0) return playerIds.sort()[0] ?? null;
  if (candidates.length === 1) return candidates[0]!.player_id;

  const judgeIdem = `party_judge:${sessionId}:${lineSource}:${[...playerIds].sort().join(",")}`;
  let judgeDebited = false;
  if (isMonetizationSpendEnabled()) {
    try {
      const r = await tryDebitSparks({
        payerUserId: sessionRow.host_user_id,
        amount: SPARK_COST_PARTY_JUDGE,
        idempotencyKey: judgeIdem,
        sessionId,
        reason: "party_vote_judge",
      });
      judgeDebited = r.applied;
    } catch (e) {
      if (e instanceof InsufficientSparksError) {
        console.warn("[party] insufficient Sparks for vote judge; using fallback", sessionId);
        return candidates.sort((a, b) => a.player_id.localeCompare(b.player_id))[0]!
          .player_id;
      }
      throw e;
    }
  }

  const { getAIProvider } = await import("@/lib/ai");
  const { runPartyVoteJudgeWorker } = await import(
    "@/lib/orchestrator/workers/party-vote-judge"
  );
  try {
    return await runPartyVoteJudgeWorker({
      sessionId,
      provider: getAIProvider(),
      candidates,
      mergedBeat: cfg.merged_beat?.trim() ?? "",
      adventurePrompt: sessionRow.adventure_prompt?.trim() ?? "",
    });
  } catch (e) {
    console.error("[party] vote judge failed", sessionId, e);
    if (judgeDebited && isMonetizationSpendEnabled()) {
      try {
        await tryCreditSparks({
          userId: sessionRow.host_user_id,
          amount: SPARK_COST_PARTY_JUDGE,
          idempotencyKey: `refund:${judgeIdem}`,
          sessionId,
          reason: "refund_party_vote_judge_failed",
        });
      } catch (refundErr) {
        console.error("[sparks] judge refund failed", refundErr);
      }
    }
    return candidates.sort((a, b) => a.player_id.localeCompare(b.player_id))[0]!
      .player_id;
  }
}

async function resolveAfterCrowdVoteFilled(params: {
  sessionId: string;
  row: typeof sessions.$inferSelect;
  cfg: PartyConfigV1;
  votes: Record<string, string>;
  submissionPlayerIds: string[];
  mode: "main" | "tiebreak";
}): Promise<PartyConfigV1> {
  const participantIds = await listPartyParticipantPlayerIds(params.sessionId);
  const topIds = listTopVoteTargets(params.votes, params.submissionPlayerIds);

  if (params.mode === "main" && topIds.length > 1) {
    if (params.cfg.instigator_slot_id?.trim()) {
      const judge = await runPartyJudgePickWinner(
        params.sessionId,
        params.row,
        params.cfg,
        topIds,
        "submissions",
      );
      return buildNextPartyConfigAfterVote({
        cfg: params.cfg,
        votes: params.votes,
        submissionPlayerIds: params.submissionPlayerIds,
        forcedWinner: judge,
        isoDeadlineFromNow,
        submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
        voteDeadlineSec: PARTY_VOTE_DEADLINE_SEC,
        participantIdsForVpTie: participantIds,
        sessionId: params.sessionId,
      });
    }
    return enterPartyVoteTiebreak({
      cfg: params.cfg,
      tiedContenderIds: topIds,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
    });
  }

  if (params.mode === "tiebreak" && topIds.length > 1) {
    const judge = await runPartyJudgePickWinner(
      params.sessionId,
      params.row,
      params.cfg,
      topIds,
      "tiebreak",
    );
    const tb = params.cfg.tiebreak_submissions ?? {};
    return buildNextPartyConfigAfterVote({
      cfg: params.cfg,
      votes: params.votes,
      submissionPlayerIds: params.submissionPlayerIds,
      forcedWinner: judge,
      winnerLineSubmissions: tb,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
      voteDeadlineSec: PARTY_VOTE_DEADLINE_SEC,
      participantIdsForVpTie: participantIds,
      sessionId: params.sessionId,
    });
  }

  const tb =
    params.mode === "tiebreak"
      ? (params.cfg.tiebreak_submissions ?? {})
      : undefined;
  return buildNextPartyConfigAfterVote({
    cfg: params.cfg,
    votes: params.votes,
    submissionPlayerIds: params.submissionPlayerIds,
    ...(tb && Object.keys(tb).length > 0
      ? { winnerLineSubmissions: tb }
      : {}),
    isoDeadlineFromNow,
    submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
    voteDeadlineSec: PARTY_VOTE_DEADLINE_SEC,
    participantIdsForVpTie: participantIds,
    sessionId: params.sessionId,
  });
}

async function resolveFinaleVotesWhenComplete(params: {
  sessionId: string;
  row: typeof sessions.$inferSelect;
  cfg: PartyConfigV1;
  votes: Record<string, string>;
}): Promise<PartyConfigV1> {
  const contenders = params.cfg.finale_tie_contender_ids ?? [];
  const topIds = listTopVoteTargets(params.votes, contenders);
  const champion =
    topIds.length === 1
      ? topIds[0]!
      : await runPartyJudgePickWinner(
          params.sessionId,
          params.row,
          params.cfg,
          topIds,
          "submissions",
        );
  return buildPartyEndedAfterFinaleVote({
    cfg: params.cfg,
    votes: params.votes,
    championPlayerId: champion,
  });
}

async function tryPartyFinaleVoteDeadlineAdvance(
  sessionId: string,
  row: typeof sessions.$inferSelect,
  cfg: PartyConfigV1,
  participantIds: string[],
): Promise<void> {
  const contenders = cfg.finale_tie_contender_ids ?? [];
  if (contenders.length < 2) return;

  const mustVote = listFinaleVotersWhoMustVote(participantIds, contenders);
  let votes = { ...(cfg.votes_this_round ?? {}) };

  if (mustVote.length === 0) {
    const judge = await runPartyJudgePickWinner(
      sessionId,
      row,
      cfg,
      contenders,
      "submissions",
    );
    const next = buildPartyEndedAfterFinaleVote({
      cfg,
      votes: {},
      championPlayerId: judge,
    });
    await persistPartyConfigOptimistic(sessionId, row, next);
    return;
  }

  const deadlinePassed = isDeadlinePassed(cfg.phase_deadline_iso);
  const allVoted = mustVote.every((id) => votes[id]);

  if (!deadlinePassed && !allVoted) return;

  if (!deadlinePassed && allVoted) {
    const next = await resolveFinaleVotesWhenComplete({
      sessionId,
      row,
      cfg,
      votes,
    });
    await persistPartyConfigOptimistic(sessionId, row, next);
    return;
  }

  votes = fillPartyFinaleAutoVotes({
    participantIds,
    contenderIds: contenders,
    votes,
  });
  if (!mustVote.every((id) => votes[id])) {
    await extendPartyVoteDeadline(sessionId, row, cfg);
    return;
  }

  const next = await resolveFinaleVotesWhenComplete({
    sessionId,
    row,
    cfg,
    votes,
  });
  await persistPartyConfigOptimistic(sessionId, row, next);
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
    round_scene_beat: null,
    scene_image_url: null,
    scene_image_by_round: {},
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

  await hydratePartyRoundSceneBeat(sessionId);

  const [out] = await db
    .select({ party_config: sessions.party_config })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const again = PartyConfigV1Schema.safeParse(out?.party_config);
  return again.success ? again.data : next;
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
 * Submit phase + round opener text exists but no scene URL for this round — enqueue art
 * (repairs dropped internal fetches / failed first pipeline).
 */
async function tryPartyHealMissingSubmitSceneImage(
  sessionId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row || row.game_kind !== "party" || row.status !== "active") return;

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success) return;
  const cfg = parsed.data;
  if (cfg.party_phase !== "submit" || !cfg.round_scene_beat?.trim()) return;

  const urlForRoundHeal =
    cfg.scene_image_by_round?.[String(cfg.round_index)]?.trim() ??
    cfg.scene_image_url?.trim();
  if (urlForRoundHeal) return;

  const { buildPartySceneImageNarrativeText } = await import(
    "@/lib/party/party-opening-narrative"
  );
  const narrativeHeal = buildPartySceneImageNarrativeText({
    sessionRow: {
      adventure_prompt: row.adventure_prompt,
      adventure_tags: row.adventure_tags,
      world_bible: row.world_bible,
      art_direction: row.art_direction,
    },
    partyConfig: cfg,
  }).trim();
  if (!narrativeHeal) return;

  const { schedulePartyRoundSceneImage } = await import(
    "@/lib/orchestrator/party-image-schedule"
  );
  await schedulePartyRoundSceneImage({
    sessionId,
    mergedBeat: narrativeHeal,
    roundIndex: cfg.round_index,
  });
}

/**
 * For `submit` phases with no opener yet: run AI round opener, persist `round_scene_beat`,
 * then schedule round scene art from the same narrative the clients see.
 */
async function hydratePartyRoundSceneBeat(sessionId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row || row.game_kind !== "party" || row.status !== "active") return;

  const parsed = PartyConfigV1Schema.safeParse(row.party_config);
  if (!parsed.success) return;
  const cfg = parsed.data;
  if (cfg.party_phase !== "submit") return;

  /** Beat already persisted — only heal missing art, do not rerun opener. */
  if (cfg.round_scene_beat?.trim()) {
    await tryPartyHealMissingSubmitSceneImage(sessionId);
    return;
  }

  const tagRaw = row.adventure_tags;
  const adventureTags = Array.isArray(tagRaw) ? tagRaw.map(String) : [];
  const { getPartyRoundMilestone } = await import("@/lib/party/party-templates");
  const milestone = getPartyRoundMilestone(cfg.template_key, cfg.round_index);

  const openerIdem = `party_round_opener:${sessionId}:${cfg.round_index}`;
  let openerDebited = false;
  let openerSkipAi = false;
  if (isMonetizationSpendEnabled()) {
    try {
      const r = await tryDebitSparks({
        payerUserId: row.host_user_id,
        amount: SPARK_COST_PARTY_ROUND_OPENER,
        idempotencyKey: openerIdem,
        sessionId,
        reason: "party_round_opener",
      });
      openerDebited = r.applied;
    } catch (e) {
      if (e instanceof InsufficientSparksError) {
        openerSkipAi = true;
        console.warn(
          "[party] insufficient Sparks for round opener; using template beat",
          sessionId,
        );
      } else {
        throw e;
      }
    }
  }

  const { getAIProvider } = await import("@/lib/ai");
  const { runPartyRoundOpenerWorker } = await import(
    "@/lib/orchestrator/workers/party-round-opener"
  );

  let beat: string;
  if (openerSkipAi) {
    beat = "";
  } else {
    try {
      beat = await runPartyRoundOpenerWorker({
        sessionId,
        provider: getAIProvider(),
        templateKey: cfg.template_key,
        roundIndex: cfg.round_index,
        totalRounds: cfg.total_rounds,
        milestone,
        sharedRoleLabel: cfg.shared_role_label ?? null,
        carryForward: cfg.carry_forward ?? null,
        adventurePrompt: row.adventure_prompt?.trim() ?? "",
        adventureTags,
        worldBibleExcerpt: (row.world_bible ?? "").slice(0, 4000),
        artDirection: row.art_direction?.trim() ?? "",
      });
    } catch (e) {
      console.error("[party] round opener failed", sessionId, e);
      if (openerDebited && isMonetizationSpendEnabled()) {
        try {
          await tryCreditSparks({
            userId: row.host_user_id,
            amount: SPARK_COST_PARTY_ROUND_OPENER,
            idempotencyKey: `refund:${openerIdem}`,
            sessionId,
            reason: "refund_party_round_opener_failed",
          });
        } catch (refundErr) {
          console.error("[sparks] opener refund failed", refundErr);
        }
      }
      beat = "";
    }
  }

  const trimmed = beat.trim();
  const round_scene_beat =
    trimmed.length > 0
      ? trimmed
      : "The table leans in; the moment hangs open — add what happens next.";

  let persistedVersion: number | null = null;
  /** True if we lost a race and another writer already stored a beat (avoid duplicate image jobs). */
  let beatAlreadyPresent = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 60 * attempt));
    }
    const [fresh] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!fresh || fresh.game_kind !== "party" || fresh.status !== "active") {
      return;
    }
    const p = PartyConfigV1Schema.safeParse(fresh.party_config);
    if (!p.success || p.data.party_phase !== "submit") return;
    if (p.data.round_scene_beat?.trim()) {
      persistedVersion = fresh.state_version;
      beatAlreadyPresent = true;
      break;
    }
    const nextCfg: PartyConfigV1 = {
      ...p.data,
      round_scene_beat,
    };
    const v = await persistPartyConfigOptimistic(sessionId, fresh, nextCfg);
    if (v != null) {
      persistedVersion = v;
      beatAlreadyPresent = false;
      break;
    }
  }

  if (persistedVersion == null) {
    console.error(
      "[party] round_scene_beat could not be persisted after retries",
      sessionId,
    );
    return;
  }

  const [rowForImage] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const cfgForImage = PartyConfigV1Schema.safeParse(rowForImage?.party_config);
  const partyConfig = cfgForImage.success ? cfgForImage.data : null;
  if (!partyConfig || partyConfig.party_phase !== "submit") return;

  const { buildPartySceneImageNarrativeText } = await import(
    "@/lib/party/party-opening-narrative"
  );
  const narrative = buildPartySceneImageNarrativeText({
    sessionRow: {
      adventure_prompt: rowForImage?.adventure_prompt,
      adventure_tags: rowForImage?.adventure_tags,
      world_bible: rowForImage?.world_bible,
      art_direction: rowForImage?.art_direction,
    },
    partyConfig,
  }).trim();

  const urlForRound =
    partyConfig.scene_image_by_round?.[String(partyConfig.round_index)]?.trim() ??
    partyConfig.scene_image_url?.trim();
  const skipDuplicateImage = beatAlreadyPresent && Boolean(urlForRound);

  if (narrative && !skipDuplicateImage) {
    const { schedulePartyRoundSceneImage } = await import(
      "@/lib/orchestrator/party-image-schedule"
    );
    await schedulePartyRoundSceneImage({
      sessionId,
      mergedBeat: narrative,
      roundIndex: partyConfig.round_index,
    });
  }
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
    const pids = await listPartyParticipantPlayerIds(sessionId);
    const nextConfig = buildNextPartyConfigAfterVote({
      cfg: cfgWithMerged,
      votes: {},
      submissionPlayerIds: submissionIds,
      forcedWinner: only,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
      voteDeadlineSec: PARTY_VOTE_DEADLINE_SEC,
      participantIdsForVpTie: pids,
      sessionId,
    });

    const version = await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    if (version != null) {
      if (nextConfig.party_phase === "submit") {
        void hydratePartyRoundSceneBeat(sessionId);
      } else {
        const { schedulePartyRoundSceneImage } = await import(
          "@/lib/orchestrator/party-image-schedule"
        );
        await schedulePartyRoundSceneImage({
          sessionId,
          mergedBeat,
          roundIndex: nextConfig.round_index,
        });
      }
    }
    return;
  }

  if (submissionIds.length === 2 && !roundSlots) {
    const cfgWithMerged: PartyConfigV1 = {
      ...cfg,
      merged_beat: mergedBeat,
      party_phase: "vote",
      votes_this_round: {},
      scene_image_url: null,
      phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
    };
    const pids = await listPartyParticipantPlayerIds(sessionId);
    const judgeWinner = await runPartyJudgePickWinner(
      sessionId,
      row,
      cfgWithMerged,
      submissionIds,
      "submissions",
    );
    const nextConfig = buildNextPartyConfigAfterVote({
      cfg: cfgWithMerged,
      votes: {},
      submissionPlayerIds: submissionIds,
      forcedWinner: judgeWinner,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
      voteDeadlineSec: PARTY_VOTE_DEADLINE_SEC,
      participantIdsForVpTie: pids,
      sessionId,
    });
    const version = await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    if (version != null) {
      if (nextConfig.party_phase === "submit") {
        void hydratePartyRoundSceneBeat(sessionId);
      } else {
        const { schedulePartyRoundSceneImage } = await import(
          "@/lib/orchestrator/party-image-schedule"
        );
        await schedulePartyRoundSceneImage({
          sessionId,
          mergedBeat,
          roundIndex: nextConfig.round_index,
        });
      }
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
        vote_slot_owner: roundSlots.vote_slot_owner,
        party_phase: "forgery_guess",
        forgery_guesses: {},
        votes_this_round: {},
        scene_image_url: null,
        phase_deadline_iso: isoDeadlineFromNow(PARTY_FORGERY_GUESS_DEADLINE_SEC),
      }
    : (() => {
        const lines = submissionIds.map((id) => ({
          player_id: id,
          text: (cfg.submissions ?? {})[id]?.text ?? "",
        }));
        const crowd = buildAnonymousCrowdVoteSlots({
          playerLines: lines,
          sessionId,
          roundIndex: cfg.round_index,
        });
        const base: PartyConfigV1 = {
          ...cfg,
          party_phase: "vote",
          merged_beat: mergedBeat,
          votes_this_round: {},
          scene_image_url: null,
          phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
        };
        return crowd
          ? {
              ...base,
              submission_slots_public: crowd.submission_slots_public,
              vote_slot_owner: crowd.vote_slot_owner,
            }
          : base;
      })();

  const version = await persistPartyConfigOptimistic(sessionId, row, nextConfig);
  if (version == null) return;

  const { schedulePartyRoundSceneImage } = await import(
    "@/lib/orchestrator/party-image-schedule"
  );
  await schedulePartyRoundSceneImage({
    sessionId,
    mergedBeat,
    roundIndex: nextConfig.round_index,
  });
}

/**
 * Tiebreak: when all contenders submitted (or deadline with ≥1 line), open anonymous tiebreak vote.
 */
export async function tryPartyTiebreakSubmitAdvance(
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
  if (!parsed.success || parsed.data.party_phase !== "tiebreak_submit") return;

  const cfg = parsed.data;
  const contenders = cfg.tiebreak_contender_ids ?? [];
  if (contenders.length < 2) return;

  const tb = cfg.tiebreak_submissions ?? {};
  const allIn = contenders.every((id) => tb[id]?.text?.trim());
  const anyIn = contenders.some((id) => tb[id]?.text?.trim());
  const deadlinePassed = isDeadlinePassed(cfg.phase_deadline_iso);

  if (!allIn) {
    if (!(deadlinePassed && anyIn)) {
      if (deadlinePassed && !anyIn) {
        await extendPartySubmitDeadlineIfStale(sessionId, row, cfg);
      }
      return;
    }
  }

  const lines = contenders
    .map((id) => ({
      player_id: id,
      text: tb[id]?.text?.trim() ?? "",
    }))
    .filter((l) => l.text);
  if (lines.length === 0) return;

  if (lines.length === 1) {
    const only = lines[0]!.player_id;
    const participantIds = await listPartyParticipantPlayerIds(sessionId);
    const nextConfig = buildNextPartyConfigAfterVote({
      cfg,
      votes: {},
      submissionPlayerIds: [only],
      forcedWinner: only,
      winnerLineSubmissions: tb,
      isoDeadlineFromNow,
      submitDeadlineSec: PARTY_SUBMIT_DEADLINE_SEC,
      voteDeadlineSec: PARTY_VOTE_DEADLINE_SEC,
      participantIdsForVpTie: participantIds,
      sessionId,
    });
    await persistPartyConfigOptimistic(sessionId, row, nextConfig);
    return;
  }

  const crowd = buildAnonymousCrowdVoteSlots({
    playerLines: lines,
    sessionId,
    roundIndex: cfg.round_index,
  });
  if (!crowd) return;

  const nextConfig: PartyConfigV1 = {
    ...cfg,
    party_phase: "tiebreak_vote",
    tiebreak_submissions: tb,
    votes_this_round: {},
    submission_slots_public: crowd.submission_slots_public,
    vote_slot_owner: crowd.vote_slot_owner,
    phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
    merged_beat: cfg.merged_beat ?? null,
  };
  await persistPartyConfigOptimistic(sessionId, row, nextConfig);
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
    vote_slot_owner: undefined,
    forgery_guesses: undefined,
    merged_beat: null,
    round_scene_beat: null,
    scene_image_url: null,
    votes_this_round: {},
  };

  if (isLastRound) {
    const participantIds = await listPartyParticipantPlayerIds(sessionId);
    const vp = { ...(cfg.vp_totals ?? {}) };
    const tiedChamps = listPlayersTiedForMaxVp(vp, participantIds);
    if (tiedChamps.length > 1) {
      const finSlots = buildFinaleAnonymousVoteSlots({
        cfg,
        contenderIds: tiedChamps,
        sessionId,
      });
      if (finSlots) {
        const nextConfig: PartyConfigV1 = {
          ...cfg,
          ...cleared,
          party_phase: "finale_tie_vote",
          finale_tie_contender_ids: tiedChamps,
          votes_this_round: {},
          submission_slots_public: finSlots.submission_slots_public,
          vote_slot_owner: finSlots.vote_slot_owner,
          phase_deadline_iso: isoDeadlineFromNow(PARTY_VOTE_DEADLINE_SEC),
        };
        await persistPartyConfigOptimistic(sessionId, row, nextConfig);
        return;
      }
    }
    const champion =
      soleVpLeaderOrNull(vp, participantIds) ?? tiedChamps[0] ?? null;
    const nextConfig: PartyConfigV1 = {
      ...cfg,
      ...cleared,
      party_phase: "ended",
      phase_deadline_iso: null,
      party_champion_player_id: champion,
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
  const version = await persistPartyConfigOptimistic(sessionId, row, nextConfig);
  if (version != null) {
    void hydratePartyRoundSceneBeat(sessionId);
  }
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
  if (!parsed.success) return;

  const phase = parsed.data.party_phase;
  if (
    phase !== "vote" &&
    phase !== "tiebreak_vote" &&
    phase !== "finale_tie_vote"
  ) {
    return;
  }

  const cfg = parsed.data;
  const participantIds = await listPartyParticipantPlayerIds(sessionId);

  if (phase === "finale_tie_vote") {
    await tryPartyFinaleVoteDeadlineAdvance(
      sessionId,
      row,
      cfg,
      participantIds,
    );
    return;
  }

  const isTiebreak = phase === "tiebreak_vote";
  const subs = isTiebreak
    ? (cfg.tiebreak_submissions ?? {})
    : (cfg.submissions ?? {});
  const submissionIds = isTiebreak
    ? (cfg.tiebreak_contender_ids ?? []).filter((id) => subs[id]?.text?.trim())
    : participantIds.filter((id) => (cfg.submissions ?? {})[id]?.text?.trim());

  if (submissionIds.length === 0) return;

  const mustVote = listParticipantsWhoMustVote(participantIds, submissionIds);
  let votes = { ...(cfg.votes_this_round ?? {}) };

  if (mustVote.length === 0) {
    const nextConfig = await resolveAfterCrowdVoteFilled({
      sessionId,
      row,
      cfg,
      votes,
      submissionPlayerIds: submissionIds,
      mode: isTiebreak ? "tiebreak" : "main",
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

  const nextConfig = await resolveAfterCrowdVoteFilled({
    sessionId,
    row,
    cfg,
    votes,
    submissionPlayerIds: submissionIds,
    mode: isTiebreak ? "tiebreak" : "main",
  });

  await persistPartyConfigOptimistic(sessionId, row, nextConfig);
}

/**
 * Record one vote; when all participants have voted, tally VP, set carry_forward, advance round or end.
 */
export async function applyPartyVoteAndMaybeAdvance(params: {
  sessionId: string;
  voterPlayerId: string;
  targetPlayerId?: string;
  targetSlotId?: string;
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
  const phase = cfg.party_phase;
  if (
    phase !== "vote" &&
    phase !== "tiebreak_vote" &&
    phase !== "finale_tie_vote"
  ) {
    return { ok: false, error: "Not in voting phase", status: 409 };
  }

  const participantIds = await listPartyParticipantPlayerIds(params.sessionId);
  if (!participantIds.includes(params.voterPlayerId)) {
    return { ok: false, error: "Not a party participant", status: 403 };
  }

  let targetPlayerId = params.targetPlayerId;
  const slotTrim = params.targetSlotId?.trim();
  if (slotTrim) {
    const owners = cfg.vote_slot_owner ?? {};
    const resolved = owners[slotTrim];
    if (!resolved) {
      return { ok: false, error: "Invalid vote slot", status: 400 };
    }
    targetPlayerId = resolved;
  }
  if (!targetPlayerId) {
    return { ok: false, error: "Missing vote target", status: 400 };
  }

  if (params.voterPlayerId === targetPlayerId) {
    return { ok: false, error: "Cannot vote for yourself", status: 400 };
  }

  let submissionIds: string[];
  let mustVote: string[];

  if (phase === "finale_tie_vote") {
    const contenders = cfg.finale_tie_contender_ids ?? [];
    const contenderSet = new Set(contenders);
    if (contenderSet.has(params.voterPlayerId)) {
      return {
        ok: false,
        error: "Tied leaders do not vote in this ballot",
        status: 400,
      };
    }
    if (!contenderSet.has(targetPlayerId)) {
      return { ok: false, error: "Invalid vote target", status: 400 };
    }
    submissionIds = contenders.filter((id) =>
      Boolean((cfg.submissions ?? {})[id]?.text?.trim()),
    );
    if (!submissionIds.includes(targetPlayerId)) {
      return { ok: false, error: "Invalid vote target", status: 400 };
    }
    mustVote = listFinaleVotersWhoMustVote(participantIds, contenders);
  } else if (phase === "tiebreak_vote") {
    const tb = cfg.tiebreak_submissions ?? {};
    if (!tb[targetPlayerId]?.text?.trim()) {
      return { ok: false, error: "Invalid vote target", status: 400 };
    }
    submissionIds = (cfg.tiebreak_contender_ids ?? []).filter((id) =>
      tb[id]?.text?.trim(),
    );
    mustVote = listParticipantsWhoMustVote(participantIds, submissionIds);
  } else {
    const subs = cfg.submissions ?? {};
    if (!subs[targetPlayerId]?.text?.trim()) {
      return { ok: false, error: "Invalid vote target", status: 400 };
    }
    submissionIds = participantIds.filter((id) => subs[id]?.text?.trim());
    mustVote = listParticipantsWhoMustVote(participantIds, submissionIds);
  }

  const votes = { ...(cfg.votes_this_round ?? {}) };
  if (votes[params.voterPlayerId]) {
    return { ok: false, error: "Already voted this round", status: 409 };
  }
  votes[params.voterPlayerId] = targetPlayerId;

  if (mustVote.length === 0) {
    return { ok: false, error: "No eligible voters this round", status: 409 };
  }
  const allVoted = mustVote.every((id) => votes[id]);

  let nextConfig: PartyConfigV1;

  if (!allVoted) {
    nextConfig = { ...cfg, votes_this_round: votes };
  } else if (phase === "finale_tie_vote") {
    nextConfig = await resolveFinaleVotesWhenComplete({
      sessionId: params.sessionId,
      row,
      cfg,
      votes,
    });
  } else {
    nextConfig = await resolveAfterCrowdVoteFilled({
      sessionId: params.sessionId,
      row,
      cfg,
      votes,
      submissionPlayerIds: submissionIds,
      mode: phase === "tiebreak_vote" ? "tiebreak" : "main",
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
