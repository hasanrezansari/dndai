import { and, desc, eq, sql } from "drizzle-orm";

import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { memorySummaries, sessions } from "@/lib/db/schema";
import { applyBetrayalOutcomeToQuest } from "@/server/services/betrayal-resolver";
import {
  defaultQuestState,
  getQuestState,
  persistQuestState,
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

/** Host-only Phase A hook: apply a registered betrayal outcome to quest + memory + bump session version. */
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
  if (prevPhase !== "idle") {
    throw new BetrayalServiceError(
      "Betrayal outcome can only be applied from phase idle (reset the arc in a later build)",
      409,
    );
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

  await db
    .update(sessions)
    .set({
      state_version: sql`${sessions.state_version} + 1`,
      updated_at: new Date(),
    })
    .where(eq(sessions.id, params.sessionId));

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
