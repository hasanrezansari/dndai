import { and, desc, eq, sql } from "drizzle-orm";

import type { AIProvider } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { generateQuestSignal } from "@/lib/orchestrator/workers/quest-signaler";
import { characters, memorySummaries, players, sessions } from "@/lib/db/schema";
import type { DiceRoll } from "@/lib/schemas/domain";

const QUEST_KIND = "quest_state_v1";
const MAX_PROGRESS = 100;
const MAX_RISK = 100;

/** Max quest % that can come from dice rolls within one narrative chapter (resets on chapter advance). */
export const CHAPTER_ROLL_PROGRESS_CAP = 36;

/** After this many turns at 100% without AI closure_ready, allow ending vote eligibility anyway. */
export const TURNS_AT_FULL_BEFORE_READY = 3;

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

export type ObjectiveLead = {
  id: string;
  text: string;
  confidence: number;
  updatedRound: number;
};

export type QuestState = {
  objective: string;
  subObjectives?: string[];
  objectiveLeads?: ObjectiveLead[];
  progress: number;
  risk: number;
  status: QuestStatus;
  endingVote: EndingVoteState | null;
  recentActions?: string[];
  /** Progress points from rolls in the current narrative chapter (see `CHAPTER_ROLL_PROGRESS_CAP`). */
  progressEarnedThisChapter?: number;
  /** Last aligned `sessions.chapter_index` for roll-budget accounting. */
  questChapterAnchor?: number;
  /** Counts turns spent at max progress while waiting for narrative closure. */
  turnsAtFullProgress?: number;
  updatedAt: string;
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isQuestState(value: unknown): value is QuestState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<QuestState>;
  const objectiveLeadsValid =
    v.objectiveLeads === undefined ||
    (Array.isArray(v.objectiveLeads) &&
      v.objectiveLeads.every(
        (lead) =>
          lead &&
          typeof lead === "object" &&
          typeof (lead as ObjectiveLead).id === "string" &&
          typeof (lead as ObjectiveLead).text === "string" &&
          typeof (lead as ObjectiveLead).confidence === "number" &&
          typeof (lead as ObjectiveLead).updatedRound === "number",
      ));
  const endingVote =
    v.endingVote === null ||
    (typeof v.endingVote === "object" && v.endingVote !== null);
  const optNums =
    (v.progressEarnedThisChapter === undefined ||
      typeof v.progressEarnedThisChapter === "number") &&
    (v.questChapterAnchor === undefined || typeof v.questChapterAnchor === "number") &&
    (v.turnsAtFullProgress === undefined || typeof v.turnsAtFullProgress === "number");
  return (
    typeof v.objective === "string" &&
    typeof v.progress === "number" &&
    typeof v.risk === "number" &&
    objectiveLeadsValid &&
    (v.status === "active" || v.status === "ready_to_end" || v.status === "failed") &&
    endingVote &&
    typeof v.updatedAt === "string" &&
    optNums
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
    objectiveLeads: [],
    progress: 0,
    risk: 0,
    status: "active",
    endingVote: null,
    updatedAt: new Date().toISOString(),
  };
}

function leadTemplate(actionType: string, result: DiceRoll["result"] | undefined): string {
  const outcome =
    result === "critical_success" || result === "success"
      ? "promising"
      : result === "critical_failure" || result === "failure"
        ? "dangerous"
        : "uncertain";
  switch (actionType) {
    case "inspect":
      return `Fresh clues appear. Keep following what feels ${outcome}.`;
    case "talk":
      return `Social pressure shifts. A ${outcome} conversation may open the next path.`;
    case "attack":
    case "cast_spell":
      return `Force changed the board. A ${outcome} opening may exist if pursued quickly.`;
    case "move":
      return `Positioning matters now. The safer route may also be the slower one.`;
    case "use_item":
      return `Resources are shaping momentum. Consider timing your next tool carefully.`;
    default:
      return `The situation evolves. Follow what seems ${outcome}, then reassess.`;
  }
}

function leadConfidence(result: DiceRoll["result"] | undefined): number {
  switch (result) {
    case "critical_success":
      return 0.9;
    case "success":
      return 0.75;
    case "failure":
      return 0.55;
    case "critical_failure":
      return 0.4;
    default:
      return 0.6;
  }
}

const SIGNAL_STOPWORDS = new Set([
  "the", "and", "with", "from", "that", "this", "into", "your", "their",
  "they", "them", "then", "there", "have", "been", "were", "while", "what",
  "where", "when", "will", "would", "could", "should", "about", "around",
  "through", "toward", "towards", "before", "after", "under", "over", "portal",
  "attack", "cast", "talk", "move", "inspect", "item",
]);

function pickByHash(seed: string, options: string[]): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return options[Math.abs(h) % options.length]!;
}

function topTerms(text: string, max = 2): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !SIGNAL_STOPWORDS.has(w));
  const uniq = Array.from(new Set(words));
  return uniq.slice(0, max);
}

function buildContextAwareLead(params: {
  objective: string;
  actionType: string;
  rollResult: DiceRoll["result"] | undefined;
  actionText?: string;
  recentNarrative?: string;
  round: number;
}): { text: string; focus: string } {
  const objectiveTerms = topTerms(params.objective, 2);
  const actionTerms = topTerms(params.actionText ?? "", 2);
  const narrativeTerms = topTerms(params.recentNarrative ?? "", 2);
  const focus =
    actionTerms[0] ??
    narrativeTerms[0] ??
    objectiveTerms[0] ??
    "the trail";

  const outcomeWord =
    params.rollResult === "critical_success" || params.rollResult === "success"
      ? "opens"
      : params.rollResult === "critical_failure" || params.rollResult === "failure"
        ? "complicates"
        : "shifts";

  const starts = [
    `Signal ${params.round}:`,
    "New read:",
    "Current read:",
    "Thread update:",
  ];
  const nudges = [
    `Pressure around ${focus} ${outcomeWord}.`,
    `${focus} now feels like the most responsive thread.`,
    `Keep probing ${focus} before the situation cools.`,
    `${focus} may connect directly to the core objective.`,
  ];
  const lanes = {
    inspect: "investigate hidden details",
    talk: "pressure social leverage",
    attack: "break immediate threats",
    cast_spell: "reshape the battlefield with magic",
    move: "claim better position",
    use_item: "spend tools for advantage",
    defend: "stabilize before pushing",
    heal: "recover tempo before committing",
    other: "test the safest thread",
  } as const;
  const lane =
    lanes[params.actionType as keyof typeof lanes] ?? lanes.other;
  const nextMoveHints = [
    `Best next move: ${lane}.`,
    `Best next move: probe ${focus} with a higher-signal action.`,
    `Best next move: force a reveal tied to ${focus}.`,
  ];
  const urgencyLine =
    params.round > 2 &&
    (params.rollResult === "failure" || params.rollResult === "critical_failure")
      ? "Urgency is rising; avoid repeating the same failed pattern."
      : "Keep momentum; confirm this thread before it drifts.";
  const caution = [
    "Avoid overcommitting until the next reveal lands.",
    "Cross-check this with the next narration beat.",
    "If this stalls, pivot to social or inspection pressure.",
    "Use the next roll to confirm or reject this lead.",
  ];

  const start = pickByHash(`${focus}:${params.round}:start`, starts);
  const nudge = pickByHash(`${focus}:${params.round}:nudge`, nudges);
  const nextMove = pickByHash(`${focus}:${params.round}:next`, nextMoveHints);
  const tail = pickByHash(`${focus}:${params.round}:tail`, caution);
  return {
    text: `${start} ${nudge} ${nextMove} ${urgencyLine} ${tail}`,
    focus,
  };
}

function dedupeLeads(leads: ObjectiveLead[]): ObjectiveLead[] {
  const out: ObjectiveLead[] = [];
  for (const lead of leads) {
    const norm = lead.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const isDuplicate = out.some((x) => {
      const other = x.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      return norm === other || norm.includes(other) || other.includes(norm);
    });
    if (!isDuplicate) out.push(lead);
  }
  return out;
}

function updateObjectiveLeads(params: {
  current: ObjectiveLead[] | undefined;
  objective: string;
  actionType: string;
  rollResult: DiceRoll["result"] | undefined;
  round: number;
  risk: number;
  actionText?: string;
  recentNarrative?: string;
  aiSignal?: {
    text: string;
    confidence: number;
  };
}): ObjectiveLead[] {
  const now = Math.max(1, params.round);
  const existing = (params.current ?? []).filter((lead) => now - lead.updatedRound <= 4);
  const id = `lead:${params.actionType}:${now}`;
  const baseline = leadTemplate(params.actionType, params.rollResult);
  const contextAware = buildContextAwareLead({
    objective: params.objective,
    actionType: params.actionType,
    rollResult: params.rollResult,
    actionText: params.actionText,
    recentNarrative: params.recentNarrative,
    round: now,
  });
  const text = params.aiSignal?.text?.trim()
    ? params.aiSignal.text.trim()
    : `${contextAware.text} ${baseline}`;
  const confidenceBase = leadConfidence(params.rollResult);
  const confidence =
    params.aiSignal?.confidence !== undefined
      ? clamp(params.aiSignal.confidence, 0, 1)
      : params.risk >= 80
      ? Math.max(0.35, confidenceBase - 0.15)
      : confidenceBase;

  const idx = existing.findIndex((lead) => lead.id.startsWith(`lead:${params.actionType}:`));
  if (idx >= 0) {
    const previous = existing[idx]!;
    existing[idx] = {
      id: previous.id,
      text,
      confidence,
      updatedRound: now,
    };
  } else {
    existing.push({
      id,
      text,
      confidence,
      updatedRound: now,
    });
  }

  return dedupeLeads(existing)
    .sort((a, b) => b.updatedRound - a.updatedRound || b.confidence - a.confidence)
    .slice(0, 3);
}

function updateSubObjectivesFromSignal(params: {
  current: string[] | undefined;
  objective: string;
  actionType: string;
  focus: string;
  aiSuggestion?: string;
}): string[] | undefined {
  const existing = [...(params.current ?? [])];
  if (params.aiSuggestion?.trim()) {
    const suggested = params.aiSuggestion.trim();
    const suggestedNorm = suggested.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const hasSimilarSuggestion = existing.some((s) => {
      const other = s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      return other.includes(suggestedNorm) || suggestedNorm.includes(other);
    });
    if (!hasSimilarSuggestion) existing.push(suggested);
  }
  const actionLabel =
    params.actionType === "cast_spell"
      ? "Use magic to influence"
      : params.actionType === "talk"
        ? "Leverage dialogue around"
        : params.actionType === "attack"
          ? "Pressure threats around"
          : params.actionType === "move"
            ? "Reposition around"
            : params.actionType === "inspect"
              ? "Investigate"
              : "Advance";
  const candidate = `${actionLabel} ${params.focus}`.trim();
  const normalized = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!normalized || normalized.length < 6) return existing.length ? existing : undefined;
  const hasSimilar = existing.some((s) => {
    const other = s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    return other.includes(normalized) || normalized.includes(other);
  });
  if (!hasSimilar) existing.push(candidate);
  const compact = existing.slice(0, 5);
  return compact.length ? compact : undefined;
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
  const [gk] = await db
    .select({ game_kind: sessions.game_kind })
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (gk?.game_kind === "party") {
    return defaultQuestState(params.objective);
  }

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
    return (
      hp <= 0 ||
      lowered.includes("dead") ||
      lowered.includes("unconscious") ||
      lowered.includes("incapacitated")
    );
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

/** Emitted when all votes cast / expired without ending — table keeps playing; chapter window may roll. */
export const QUEST_ENDING_VOTE_COOLDOWN_MESSAGE =
  "Ending vote failed; cooldown started" as const;

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
        : QUEST_ENDING_VOTE_COOLDOWN_MESSAGE,
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
      return { progressDelta: 9, riskDelta: -3 };
    case "success":
      return { progressDelta: 6, riskDelta: -1 };
    case "critical_failure":
      return { progressDelta: 1, riskDelta: 10 };
    case "failure":
      return { progressDelta: 2, riskDelta: 6 };
    default:
      return { progressDelta: 2, riskDelta: 2 };
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
  turnId?: string | null;
  round: number;
  chapterIndex: number;
  objectiveFallback: string;
  actionType: string;
  diceRolls: DiceRoll[];
  actionText?: string;
  recentNarrative?: string;
  provider?: AIProvider;
}): Promise<{
  state: QuestState;
  visibleChanges: string[];
  shouldEndSession: boolean;
}> {
  const current =
    (await getQuestState(params.sessionId)) ??
    defaultQuestState(params.objectiveFallback);

  const chapterIndex = params.chapterIndex;
  let earnedInChapter = current.progressEarnedThisChapter ?? 0;
  const prevAnchor = current.questChapterAnchor;
  if (prevAnchor !== undefined && prevAnchor !== chapterIndex) {
    earnedInChapter = 0;
  }

  const recentActions = Array.isArray(current.recentActions)
    ? [...current.recentActions]
    : [];
  const consecutiveSame = recentActions.filter(
    (a) => a === params.actionType,
  ).length;
  const diminishing = Math.max(0.25, 1 - consecutiveSame * 0.2);

  const primary = scoreFromRoll(params.diceRolls[0]?.result);
  const weight = intentWeight(params.actionType) * diminishing;
  const rawProgressDelta = Math.max(1, Math.round(primary.progressDelta * weight));
  const room = Math.max(0, CHAPTER_ROLL_PROGRESS_CAP - earnedInChapter);
  const progressDelta = Math.min(rawProgressDelta, room);
  earnedInChapter += progressDelta;
  const riskDelta = Math.round(primary.riskDelta);

  recentActions.push(params.actionType);
  if (recentActions.length > 5) recentActions.shift();

  const progress = clamp(current.progress + progressDelta, 0, MAX_PROGRESS);
  let risk = clamp(current.risk + riskDelta, 0, MAX_RISK);
  let status: QuestStatus = current.status;

  let turnsAtFull = current.turnsAtFullProgress ?? 0;
  if (progress >= MAX_PROGRESS) {
    turnsAtFull =
      current.progress >= MAX_PROGRESS ? turnsAtFull + 1 : 1;
  } else {
    turnsAtFull = 0;
  }

  const partyDown = await allPartyMembersIncapacitated(params.sessionId);
  if (partyDown || risk >= MAX_RISK) {
    status = "failed";
    risk = MAX_RISK;
  }

  const trimmedByChapterCap = rawProgressDelta > progressDelta;

  const contextLead = buildContextAwareLead({
    objective: current.objective,
    actionType: params.actionType,
    rollResult: params.diceRolls[0]?.result,
    round: params.round,
    actionText: params.actionText,
    recentNarrative: params.recentNarrative,
  });
  let aiSignal:
    | {
        text: string;
        confidence: number;
        suggestedSubObjective?: string;
        closureReady: boolean;
      }
    | undefined;
  if (params.provider) {
    const ai = await generateQuestSignal({
      sessionId: params.sessionId,
      turnId: params.turnId ?? null,
      objective: current.objective,
      actionType: params.actionType,
      actionText: params.actionText,
      recentNarrative: params.recentNarrative,
      round: params.round,
      rollResult: params.diceRolls[0]?.result,
      risk,
      progress,
      provider: params.provider,
    });
    aiSignal = {
      text: ai.data.signal_text,
      confidence: ai.data.confidence,
      suggestedSubObjective: ai.data.suggested_sub_objective,
      closureReady: ai.data.closure_ready ?? false,
    };
  }

  if (status !== "failed" && progress >= MAX_PROGRESS) {
    if (current.status === "ready_to_end") {
      status = "ready_to_end";
    } else {
      const narrativeGate =
        (aiSignal?.closureReady === true) ||
        turnsAtFull >= TURNS_AT_FULL_BEFORE_READY;
      status = narrativeGate ? "ready_to_end" : "active";
    }
  }

  const nextState: QuestState = {
    objective: current.objective,
    subObjectives: updateSubObjectivesFromSignal({
      current: current.subObjectives,
      objective: current.objective,
      actionType: params.actionType,
      focus: contextLead.focus,
      aiSuggestion: aiSignal?.suggestedSubObjective,
    }),
    objectiveLeads: updateObjectiveLeads({
      current: current.objectiveLeads,
      objective: current.objective,
      actionType: params.actionType,
      rollResult: params.diceRolls[0]?.result,
      round: params.round,
      risk,
      actionText: params.actionText,
      recentNarrative: params.recentNarrative,
      aiSignal:
        aiSignal?.text?.trim()
          ? {
              text: aiSignal.text,
              confidence: aiSignal.confidence,
            }
          : undefined,
    }),
    progress,
    risk,
    status,
    endingVote: current.endingVote ?? null,
    recentActions,
    progressEarnedThisChapter: earnedInChapter,
    questChapterAnchor: chapterIndex,
    turnsAtFullProgress: turnsAtFull,
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
  if (trimmedByChapterCap) {
    visibleChanges.push("Chapter momentum cap — progress from this turn was trimmed");
  }
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

/**
 * Resets per-chapter roll progress budget when the narrative chapter advances.
 */
export async function syncQuestStateAfterChapterAdvance(params: {
  sessionId: string;
  chapterIndex: number;
  round: number;
}): Promise<void> {
  const current = await getQuestState(params.sessionId);
  if (!current) return;
  await persistQuestState(params.sessionId, params.round, {
    ...current,
    progressEarnedThisChapter: 0,
    questChapterAnchor: params.chapterIndex,
    turnsAtFullProgress: 0,
    updatedAt: new Date().toISOString(),
  });
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

