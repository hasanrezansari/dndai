import { and, desc, eq, sql } from "drizzle-orm";

import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { memorySummaries, players, sessions } from "@/lib/db/schema";
import { isPlayerForUser } from "@/lib/auth/guards";
import { applyBetrayalOutcomeToQuest } from "@/server/services/betrayal-resolver";
import {
  assertBetrayalPhaseTransition,
  type BetrayalFsmPhase,
} from "@/server/services/betrayal-state-machine";
import {
  defaultQuestState,
  getQuestState,
  persistQuestState,
  type BetrayalQuestSlice,
  type QuestState,
} from "@/server/services/quest-service";

const BETRAYAL_FACT_KIND = "betrayal_fact_v1";

export class BetrayalServiceError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "BetrayalServiceError";
  }
}

export async function insertBetrayalFactMemory(params: {
  sessionId: string;
  round: number;
  text: string;
  outcomeId: string;
}): Promise<void> {
  await db.insert(memorySummaries).values({
    session_id: params.sessionId,
    summary_type: "betrayal_fact_v1",
    turn_range_start: Math.max(1, params.round),
    turn_range_end: Math.max(1, params.round),
    content: {
      kind: BETRAYAL_FACT_KIND,
      text: params.text,
      outcome_id: params.outcomeId,
    },
  });
}

async function bumpSessionStateVersion(sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}

/**
 * Align `sessions.phase` with an open confrontation when not in tactical combat.
 * Mid-combat betrayals keep `combat` so the shell stays fight-forward.
 */
async function nudgeSessionExplorationPhaseForConfrontation(
  sessionId: string,
): Promise<void> {
  const [row] = await db
    .select({ phase: sessions.phase })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return;
  const p = row.phase;
  if (p === "exploration" || p === "rest" || p === "social") {
    await db
      .update(sessions)
      .set({ phase: "social", updated_at: new Date() })
      .where(eq(sessions.id, sessionId));
  }
}

async function insertBetrayalTimelineNote(params: {
  sessionId: string;
  round: number;
  text: string;
}): Promise<void> {
  await db.insert(memorySummaries).values({
    session_id: params.sessionId,
    summary_type: "betrayal_fact_v1",
    turn_range_start: Math.max(1, params.round),
    turn_range_end: Math.max(1, params.round),
    content: {
      kind: BETRAYAL_FACT_KIND,
      text: params.text,
      outcome_id: "__phase__",
    },
  });
}

/**
 * Betrayal phase transitions:
 * - `story_only`: host may reset arc (`idle`) after a resolved/confronting beat.
 * - `confrontational`: full beat flow (rogue intent, confrontation, reset).
 */
export async function transitionBetrayalPhase(params: {
  sessionId: string;
  userId: string;
  targetPhase: "rogue_intent" | "confronting" | "idle";
  instigatorPlayerId?: string | null;
}): Promise<{ phase: string }> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!row) {
    throw new BetrayalServiceError("Session not found", 404);
  }
  if (row.game_kind !== "campaign") {
    throw new BetrayalServiceError("Betrayal spine is campaign-only", 400);
  }
  const mode = row.betrayal_mode ?? "off";
  if (mode === "off") {
    throw new BetrayalServiceError(
      "Betrayal mode is off for this session",
      409,
    );
  }
  if (params.targetPhase !== "idle" && mode !== "confrontational") {
    throw new BetrayalServiceError(
      "Rogue intent and confrontation require betrayal_mode confrontational",
      409,
    );
  }
  if (row.status !== "active" && row.status !== "paused") {
    throw new BetrayalServiceError(
      "Betrayal phases can only change during an active or paused session",
      409,
    );
  }

  const round = row.current_round;
  const quest =
    (await getQuestState(params.sessionId)) ??
    defaultQuestState("Survive the adventure.");
  const slice = quest.betrayal;
  const from: BetrayalFsmPhase = (slice?.phase as BetrayalFsmPhase) ?? "idle";

  if (params.targetPhase === "idle") {
    if (row.host_user_id !== params.userId) {
      throw new BetrayalServiceError("Only the host can reset the betrayal arc", 403);
    }
    if (from === "idle") {
      return { phase: "idle" };
    }
    assertBetrayalPhaseTransition(from, "idle");
    const nextQuest: QuestState = {
      ...quest,
      betrayal: { phase: "idle", last_updated_round: round },
      updatedAt: new Date().toISOString(),
    };
    await persistQuestState(params.sessionId, round, nextQuest);
    await insertBetrayalTimelineNote({
      sessionId: params.sessionId,
      round,
      text: `[Betrayal phase] ${from} → idle (arc reset)`,
    });
    await bumpSessionStateVersion(params.sessionId);
    return { phase: "idle" };
  }

  if (params.targetPhase === "rogue_intent") {
    assertBetrayalPhaseTransition(from, "rogue_intent");
    const inst = params.instigatorPlayerId?.trim();
    if (!inst) {
      throw new BetrayalServiceError(
        "instigatorPlayerId is required to declare rogue intent",
        400,
      );
    }
    const allowed =
      row.host_user_id === params.userId ||
      (await isPlayerForUser(inst, params.sessionId, params.userId));
    if (!allowed) {
      throw new BetrayalServiceError(
        "Only the instigating player or host may declare rogue intent",
        403,
      );
    }
    const [pRow] = await db
      .select({ id: players.id })
      .from(players)
      .where(
        and(eq(players.id, inst), eq(players.session_id, params.sessionId)),
      )
      .limit(1);
    if (!pRow) {
      throw new BetrayalServiceError("instigatorPlayerId is not in this session", 400);
    }

    const nextSlice: BetrayalQuestSlice = {
      phase: "rogue_intent",
      instigator_player_id: inst,
      last_updated_round: round,
    };
    const nextQuest: QuestState = {
      ...quest,
      betrayal: nextSlice,
      updatedAt: new Date().toISOString(),
    };
    await persistQuestState(params.sessionId, round, nextQuest);
    await insertBetrayalTimelineNote({
      sessionId: params.sessionId,
      round,
      text: `[Betrayal phase] ${from} → rogue_intent; instigator_player_id=${inst}`,
    });
    await bumpSessionStateVersion(params.sessionId);
    return { phase: "rogue_intent" };
  }

  if (params.targetPhase === "confronting") {
    if (row.host_user_id !== params.userId) {
      throw new BetrayalServiceError(
        "Only the host can open the confrontation beat",
        403,
      );
    }
    assertBetrayalPhaseTransition(from, "confronting");
    const inst =
      params.instigatorPlayerId?.trim() ||
      (from === "rogue_intent" ? slice?.instigator_player_id?.trim() : null) ||
      null;

    const nextSlice: BetrayalQuestSlice = {
      phase: "confronting",
      ...(inst ? { instigator_player_id: inst } : {}),
      last_updated_round: round,
    };
    const nextQuest: QuestState = {
      ...quest,
      betrayal: nextSlice,
      updatedAt: new Date().toISOString(),
    };
    await persistQuestState(params.sessionId, round, nextQuest);
    await insertBetrayalTimelineNote({
      sessionId: params.sessionId,
      round,
      text: `[Betrayal phase] ${from} → confronting${inst ? `; instigator_player_id=${inst}` : ""}`,
    });
    await nudgeSessionExplorationPhaseForConfrontation(params.sessionId);
    await bumpSessionStateVersion(params.sessionId);
    return { phase: "confronting" };
  }

  throw new BetrayalServiceError("Invalid target phase", 400);
}

/** Host-only: apply registered betrayal outcome; story_only from idle; confrontational from idle or confronting. */
export async function applyHostBetrayalOutcome(params: {
  sessionId: string;
  hostUserId: string;
  outcomeId: string;
  traitorPlayerId?: string | null;
  macguffinHolderPlayerId?: string | null;
}): Promise<{ questObjective: string; outcomeId: string }> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, params.sessionId))
    .limit(1);
  if (!row) {
    throw new BetrayalServiceError("Session not found", 404);
  }
  if (row.host_user_id !== params.hostUserId) {
    throw new BetrayalServiceError("Only the host can apply betrayal outcomes", 403);
  }
  if (row.game_kind !== "campaign") {
    throw new BetrayalServiceError("Betrayal spine is campaign-only", 400);
  }
  const mode = row.betrayal_mode ?? "off";
  if (mode === "off") {
    throw new BetrayalServiceError(
      "Betrayal mode is off for this session. Enable story_only or confrontational first.",
      409,
    );
  }
  if (row.status !== "active" && row.status !== "paused") {
    throw new BetrayalServiceError(
      "Betrayal outcomes can only be applied during an active or paused session",
      409,
    );
  }

  const round = row.current_round;
  let quest =
    (await getQuestState(params.sessionId)) ??
    defaultQuestState("Survive the adventure.");

  const prevPhase = quest.betrayal?.phase ?? "idle";
  if (mode === "story_only") {
    if (prevPhase !== "idle") {
      throw new BetrayalServiceError(
        "Betrayal outcome can only be applied from phase idle in story_only mode",
        409,
      );
    }
  } else if (mode === "confrontational") {
    if (prevPhase !== "idle" && prevPhase !== "confronting") {
      throw new BetrayalServiceError(
        "Apply an outcome from idle or during open confrontation, or reset the arc",
        409,
      );
    }
  }

  const { quest: nextQuest, memoryFactLine } = applyBetrayalOutcomeToQuest(
    quest,
    params.outcomeId,
    {
      traitor_player_id: params.traitorPlayerId ?? null,
      macguffin_holder_player_id: params.macguffinHolderPlayerId ?? null,
      round,
    },
  );

  await persistQuestState(params.sessionId, round, nextQuest);
  await insertBetrayalFactMemory({
    sessionId: params.sessionId,
    round,
    text: memoryFactLine,
    outcomeId: nextQuest.betrayal?.outcome_id ?? params.outcomeId,
  });

  await bumpSessionStateVersion(params.sessionId);

  return {
    questObjective: nextQuest.objective,
    outcomeId: nextQuest.betrayal?.outcome_id ?? params.outcomeId,
  };
}

/** Latest betrayal fact lines for memory assembler / prompts. */
export async function fetchBetrayalFactLines(
  sessionId: string,
  limit = 5,
): Promise<string[]> {
  const rows = await db
    .select({ content: memorySummaries.content })
    .from(memorySummaries)
    .where(
      and(
        eq(memorySummaries.session_id, sessionId),
        eq(memorySummaries.summary_type, "betrayal_fact_v1"),
      ),
    )
    .orderBy(desc(memorySummaries.created_at))
    .limit(limit);
  const out: string[] = [];
  for (const r of rows) {
    const c = r.content as Record<string, unknown>;
    const t = typeof c.text === "string" ? c.text.trim() : "";
    if (t) out.push(t);
  }
  return out.reverse();
}
