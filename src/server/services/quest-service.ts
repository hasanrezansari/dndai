import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { characters, memorySummaries, players, sessions } from "@/lib/db/schema";
import type { DiceRoll } from "@/lib/schemas/domain";

const QUEST_KIND = "quest_state_v1";
const MAX_PROGRESS = 100;
const MAX_RISK = 100;

export type QuestStatus = "active" | "ready_to_end" | "failed";
export type EndingVoteChoice = "end_now" | "continue";

export type EndingVoteState = {
  open: boolean;
  reason: "objective_complete" | "party_defeated";
  initiatedRound: number;
  cooldownUntilRound: number;
  failedAttempts: number;
  requiredYes: number;
  eligibleVoterIds: string[];
  votes: Record<string, EndingVoteChoice>;
};

export type QuestState = {
  objective: string;
  subObjectives?: string[];
  progress: number;
  risk: number;
  status: QuestStatus;
  endingVote: EndingVoteState | null;
  recentActions?: string[];
  updatedAt: string;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isQuestState(value: unknown): value is QuestState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<QuestState>;
  const endingVote =
    v.endingVote === null ||
    (typeof v.endingVote === "object" && v.endingVote !== null);
  return (
    typeof v.objective === "string" &&
    typeof v.progress === "number" &&
    typeof v.risk === "number" &&
    (v.status === "active" || v.status === "ready_to_end" || v.status === "failed") &&
    endingVote &&
    typeof v.updatedAt === "string"
  );
}

function normalizeObjective(objective: string): string {
  const o = objective.trim();
  if (!o) return "Survive the adventure and complete your mission.";
  if (o.length <= 140) return o;
  return `${o.slice(0, 137)}...`;
}

function extractSubObjectives(raw: string): string[] {
  const lines = raw.split(/\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1, 6);
}

export function defaultQuestState(objective: string): QuestState {
  const subs = extractSubObjectives(objective);
  return {
    objective: normalizeObjective(objective),
    subObjectives: subs.length > 0 ? subs : undefined,
    progress: 0,
    risk: 0,
    status: "active",
    endingVote: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function getQuestState(sessionId: string): Promise<QuestState | null> {
  const rows = await db
    .select({ content: memorySummaries.content })
    .from(memorySummaries)
    .where(eq(memorySummaries.session_id, sessionId))
    .orderBy(desc(memorySummaries.created_at))
    .limit(25);
  for (const row of rows) {
    if (!row?.content || typeof row.content !== "object") continue;
    const content = row.content as Record<string, unknown>;
    if (content.kind !== QUEST_KIND) continue;
    const state = content.state;
    if (isQuestState(state)) return state;
  }
  return null;
}

export async function initializeQuestState(params: {
  sessionId: string;
  objective: string;
  subObjectives?: string[];
  round: number;
}): Promise<QuestState> {
  const existing = await getQuestState(params.sessionId);
  if (existing) return existing;
  const state = defaultQuestState(params.objective);
  if (params.subObjectives?.length) {
    state.subObjectives = params.subObjectives;
  }
  await persistQuestState(params.sessionId, params.round, state);
  return state;
}

async function allPartyMembersIncapacitated(sessionId: string): Promise<boolean> {
  const rows = await db
    .select({
      playerId: players.id,
      hp: characters.hp,
      conditions: characters.conditions,
    })
    .from(players)
    .leftJoin(characters, eq(characters.player_id, players.id))
    .where(and(eq(players.session_id, sessionId), eq(players.is_dm, false)));

  if (rows.length === 0) return false;
  const withCharacters = rows.filter((r) => typeof r.hp === "number");
  if (withCharacters.length === 0) return false;

  return withCharacters.every((r) => {
    const hp = r.hp ?? 1;
    const conditions = Array.isArray(r.conditions) ? r.conditions : [];
    const lowered = conditions.map((c) => String(c).toLowerCase());
    return hp <= 0 || lowered.includes("dead") || lowered.includes("unconscious");
  });
}

async function eligibleEndingVoters(sessionId: string): Promise<string[]> {
  const rows = await db
    .select({
      playerId: players.id,
      isDm: players.is_dm,
      hp: characters.hp,
      conditions: characters.conditions,
    })
    .from(players)
    .leftJoin(characters, eq(characters.player_id, players.id))
    .where(eq(players.session_id, sessionId));

  const alive = rows
    .filter((r) => !r.isDm)
    .filter((r) => {
      const hp = typeof r.hp === "number" ? r.hp : 1;
      const conditions = Array.isArray(r.conditions) ? r.conditions : [];
      const lowered = conditions.map((c) => String(c).toLowerCase());
      return hp > 0 && !lowered.includes("dead") && !lowered.includes("unconscious");
    })
    .map((r) => r.playerId);

  if (alive.length > 0) return alive;
  return rows.filter((r) => !r.isDm).map((r) => r.playerId);
}

export function maybeOpenEndingVote(
  state: QuestState,
  round: number,
  eligibleVoterIds: string[],
): { state: QuestState; opened: boolean } {
  if (!(state.status === "ready_to_end" || state.status === "failed")) {
    return {
      state: {
        ...state,
        endingVote: null,
      },
      opened: false,
    };
  }

  const prev = state.endingVote;
  if (prev?.open) {
    return { state, opened: false };
  }
  if (prev && round < prev.cooldownUntilRound) {
    return { state, opened: false };
  }

  const failedAttempts = prev?.failedAttempts ?? 0;
  const reason =
    state.status === "failed" ? "party_defeated" : "objective_complete";

  const requiredYes = Math.max(1, Math.ceil(eligibleVoterIds.length * 0.6));

  return {
    state: {
      ...state,
      endingVote: {
        open: true,
        reason,
        initiatedRound: round,
        cooldownUntilRound: prev?.cooldownUntilRound ?? round,
        failedAttempts,
        requiredYes,
        eligibleVoterIds,
        votes: {},
      },
    },
    opened: true,
  };
}

export function evaluateEndingVote(
  state: QuestState,
  round: number,
): {
  state: QuestState;
  shouldEndSession: boolean;
  changed: boolean;
  message: string | null;
} {
  const vote = state.endingVote;
  if (!vote?.open) {
    return { state, shouldEndSession: false, changed: false, message: null };
  }

  const votes = vote.votes;
  const yesCount = vote.eligibleVoterIds.filter((id) => votes[id] === "end_now").length;
  const allCast = vote.eligibleVoterIds.every((id) => id in votes);
  const voteExpired = round >= vote.initiatedRound + 2;

  if (yesCount >= vote.requiredYes) {
    return {
      state: {
        ...state,
        endingVote: {
          ...vote,
          open: false,
          cooldownUntilRound: round,
        },
      },
      shouldEndSession: true,
      changed: true,
      message: "Ending vote passed",
    };
  }

  if (allCast || voteExpired) {
    const failedAttempts = vote.failedAttempts + 1;
    const cooldownUntilRound = round + 3;
    const shouldForceEnd = failedAttempts >= 2;
    return {
      state: {
        ...state,
        endingVote: {
          ...vote,
          open: false,
          failedAttempts,
          cooldownUntilRound,
        },
      },
      shouldEndSession: shouldForceEnd,
      changed: true,
      message: shouldForceEnd
        ? "Ending forced after repeated stalemate"
        : "Ending vote failed; cooldown started",
    };
  }

  return { state, shouldEndSession: false, changed: false, message: null };
}

export function scoreFromRoll(result: DiceRoll["result"] | undefined): {
  progressDelta: number;
  riskDelta: number;
} {
  switch (result) {
    case "critical_success":
      return { progressDelta: 12, riskDelta: -3 };
    case "success":
      return { progressDelta: 8, riskDelta: -1 };
    case "critical_failure":
      return { progressDelta: 1, riskDelta: 10 };
    case "failure":
      return { progressDelta: 2, riskDelta: 6 };
    default:
      return { progressDelta: 3, riskDelta: 2 };
  }
}

export function intentWeight(actionType: string): number {
  switch (actionType) {
    case "attack":
    case "cast_spell":
      return 1.1;
    case "talk":
      return 0.9;
    case "inspect":
      return 1.0;
    case "move":
    case "use_item":
      return 0.8;
    default:
      return 0.7;
  }
}

export async function applyTurnQuestProgress(params: {
  sessionId: string;
  round: number;
  objectiveFallback: string;
  actionType: string;
  diceRolls: DiceRoll[];
}): Promise<{
  state: QuestState;
  visibleChanges: string[];
  shouldEndSession: boolean;
}> {
  const current =
    (await getQuestState(params.sessionId)) ??
    defaultQuestState(params.objectiveFallback);

  const recentActions = Array.isArray(current.recentActions)
    ? [...current.recentActions]
    : [];
  const consecutiveSame = recentActions.filter(
    (a) => a === params.actionType,
  ).length;
  const diminishing = Math.max(0.25, 1 - consecutiveSame * 0.2);

  const primary = scoreFromRoll(params.diceRolls[0]?.result);
  const weight = intentWeight(params.actionType) * diminishing;
  const progressDelta = Math.max(1, Math.round(primary.progressDelta * weight));
  const riskDelta = Math.round(primary.riskDelta);

  recentActions.push(params.actionType);
  if (recentActions.length > 5) recentActions.shift();

  let progress = clamp(current.progress + progressDelta, 0, MAX_PROGRESS);
  let risk = clamp(current.risk + riskDelta, 0, MAX_RISK);
  let status: QuestStatus = current.status;

  if (progress >= MAX_PROGRESS) {
    status = "ready_to_end";
  }

  const partyDown = await allPartyMembersIncapacitated(params.sessionId);
  if (partyDown || risk >= MAX_RISK) {
    status = "failed";
    risk = MAX_RISK;
  }

  const nextState: QuestState = {
    objective: current.objective,
    progress,
    risk,
    status,
    endingVote: current.endingVote ?? null,
    recentActions,
    updatedAt: new Date().toISOString(),
  };

  const voters = await eligibleEndingVoters(params.sessionId);
  const voteOpened = maybeOpenEndingVote(nextState, params.round, voters);
  const voteEval = evaluateEndingVote(voteOpened.state, params.round);
  const finalState: QuestState = {
    ...voteEval.state,
    updatedAt: new Date().toISOString(),
  };

  await persistQuestState(params.sessionId, params.round, finalState);

  const visibleChanges = [
    `Quest progress ${finalState.progress}%`,
    `Danger ${finalState.risk}%`,
  ];
  if (finalState.status === "ready_to_end" && current.status !== "ready_to_end") {
    visibleChanges.push("Objective threshold reached");
  }
  if (finalState.status === "failed" && current.status !== "failed") {
    visibleChanges.push("Quest failure condition triggered");
  }
  if (voteOpened.opened) {
    visibleChanges.push("Ending vote opened");
  }
  if (voteEval.message) {
    visibleChanges.push(voteEval.message);
  }

  return {
    state: finalState,
    visibleChanges,
    shouldEndSession: voteEval.shouldEndSession,
  };
}

export async function castEndingVote(params: {
  sessionId: string;
  round: number;
  playerId: string;
  choice: EndingVoteChoice;
}): Promise<{
  state: QuestState;
  shouldEndSession: boolean;
  message: string;
}> {
  const current = await getQuestState(params.sessionId);
  if (!current?.endingVote?.open) {
    throw new Error("No active ending vote");
  }
  if (!current.endingVote.eligibleVoterIds.includes(params.playerId)) {
    throw new Error("Player is not eligible to vote");
  }

  const next: QuestState = {
    ...current,
    endingVote: {
      ...current.endingVote,
      votes: {
        ...current.endingVote.votes,
        [params.playerId]: params.choice,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  const voteEval = evaluateEndingVote(next, params.round);
  const finalState: QuestState = {
    ...voteEval.state,
    updatedAt: new Date().toISOString(),
  };

  await persistQuestState(params.sessionId, params.round, finalState);

  return {
    state: finalState,
    shouldEndSession: voteEval.shouldEndSession,
    message:
      voteEval.message ??
      (params.choice === "end_now"
        ? "Vote recorded: end now"
        : "Vote recorded: continue"),
  };
}

export async function finalizeSessionEnd(sessionId: string): Promise<number> {
  const [updated] = await db
    .update(sessions)
    .set({
      status: "ended",
      current_player_id: null,
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, sessionId))
    .returning({ stateVersion: sessions.state_version });

  return updated?.stateVersion ?? 0;
}

async function persistQuestState(
  sessionId: string,
  round: number,
  state: QuestState,
): Promise<void> {
  await db.insert(memorySummaries).values({
    session_id: sessionId,
    summary_type: "milestone",
    turn_range_start: Math.max(1, round),
    turn_range_end: Math.max(1, round),
    content: {
      kind: QUEST_KIND,
      state,
    },
  });
}

